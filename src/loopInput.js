/**
 * loopInput.js — Detect whether an input call sits inside a loop and
 * estimate how many times that input will run (constant bounds only).
 *
 * Used by inputChips to collect N rounds of values (capped by settings.maxLoopInputs).
 */

/**
 * Find matching closing brace from an opening `{` position in full source.
 * Returns index of `}` or -1.
 */
function matchBrace(src, openIdx) {
  let depth = 0;
  let inStr = null;
  let inLine = false;
  let inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Line number (0-based) of character offset. */
function offsetToLine(lineStarts, offset) {
  // binary search
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function buildLineStarts(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * Try to evaluate a simple integer expression: digits, +-, *, identifiers→unknown.
 * @returns {number|null}
 */
function evalSimpleInt(expr, env = {}) {
  const e = String(expr || '')
    .replace(/\s+/g, '')
    .replace(/U?LL?$/i, '');
  if (!e) return null;
  if (/^[+-]?\d+$/.test(e)) return parseInt(e, 10);
  if (Object.prototype.hasOwnProperty.call(env, e) && Number.isFinite(env[e])) {
    return env[e];
  }
  // a+b, a-b with constants
  const m = e.match(/^([+-]?\d+)([+-])([+-]?\d+)$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[3], 10);
    return m[2] === '+' ? a + b : a - b;
  }
  return null;
}

/**
 * Parse classic for-loop header and estimate iteration count.
 * Supports: for (i=0; i<N; i++), for(int i=0;i<=N;i++), for(i=N;i>0;i--)
 * @returns {{ iterations: number|null, unbounded: boolean, varName: string|null, detail: string }}
 */
export function estimateForIterations(header) {
  const h = String(header || '').trim();
  // strip for (...)
  const m = h.match(/^\s*for\s*\(([\s\S]*)\)\s*$/i);
  const body = m ? m[1] : h;
  const parts = body.split(';');
  if (parts.length < 2) {
    return { iterations: null, unbounded: true, varName: null, detail: 'unparsed for' };
  }
  const init = parts[0].trim();
  const cond = parts[1].trim();
  const step = (parts[2] || '').trim();

  // init: int i = 0  |  i = 0
  let varName = null;
  let start = null;
  const initEq = init.match(/(?:(?:int|long|short|unsigned|size_t|auto)\s+)?([A-Za-z_]\w*)\s*=\s*([^,;]+)/);
  if (initEq) {
    varName = initEq[1];
    start = evalSimpleInt(initEq[2]);
  }

  // condition: i < N | i <= N | i > N | i >= N | N > i  (N may be a variable)
  let end = null;
  /** @type {string|null} variable used as bound when not a constant */
  let boundVar = null;
  let op = null;
  let inclusive = false;
  const condM = cond.match(
    /^([A-Za-z_]\w*)\s*(<=|>=|<|>|!=|==)\s*(.+)$/
  ) || cond.match(/^(.+?)\s*(<=|>=|<|>)\s*([A-Za-z_]\w*)$/);
  if (condM) {
    const left = condM[1].trim();
    op = condM[2];
    const right = condM[3].trim();
    if (/^[A-Za-z_]/.test(left) && (varName == null || left === varName)) {
      varName = varName || left;
      end = evalSimpleInt(right);
      if (end == null && /^[A-Za-z_]\w*$/.test(right)) boundVar = right;
      inclusive = op === '<=' || op === '>=';
    } else if (/^[A-Za-z_]/.test(right) && (varName == null || right === varName)) {
      varName = varName || right;
      end = evalSimpleInt(left);
      if (end == null && /^[A-Za-z_]\w*$/.test(left)) boundVar = left;
      // flipped: N > i  → treat as i < N
      if (op === '>') {
        op = '<';
        inclusive = false;
      } else if (op === '>=') {
        op = '<=';
        inclusive = true;
      } else if (op === '<') {
        op = '>';
        inclusive = false;
      } else if (op === '<=') {
        op = '>=';
        inclusive = true;
      }
    }
  }

  // step: i++ | ++i | i-- | i += k | i -= k
  let delta = 1;
  let decreasing = false;
  if (/\+\+/.test(step) || /\+=\s*1\b/.test(step)) delta = 1;
  else if (/--/.test(step) || /-=\s*1\b/.test(step)) {
    delta = 1;
    decreasing = true;
  } else {
    const add = step.match(/[+\-]=\s*([+-]?\d+)/);
    if (add) {
      delta = Math.abs(parseInt(add[1], 10) || 1);
      decreasing = step.includes('-=') || parseInt(add[1], 10) < 0;
    }
  }

  if (start == null || !op) {
    return {
      iterations: null,
      unbounded: true,
      varName,
      boundVar,
      detail: 'non-constant bounds',
    };
  }

  if (end == null) {
    // bound depends on a variable (e.g. i <= b) — iterations resolved later from input chips
    return {
      iterations: null,
      unbounded: true,
      varName,
      boundVar,
      start,
      op,
      inclusive,
      delta,
      decreasing,
      detail: boundVar
        ? `${varName || 'i'} … depends on ${boundVar}`
        : 'non-constant bounds',
    };
  }

  let count = null;
  if (!decreasing && (op === '<' || op === '<=')) {
    const last = inclusive ? end : end - 1;
    if (last < start) count = 0;
    else count = Math.floor((last - start) / delta) + 1;
  } else if (decreasing && (op === '>' || op === '>=')) {
    const last = inclusive ? end : end + 1;
    if (last > start) count = 0;
    else count = Math.floor((start - last) / delta) + 1;
  } else if (!decreasing && (op === '>' || op === '>=')) {
    count = null;
  }

  if (count == null || !Number.isFinite(count) || count < 0) {
    return {
      iterations: null,
      unbounded: true,
      varName,
      boundVar,
      detail: 'could not evaluate',
    };
  }
  return {
    iterations: count,
    unbounded: false,
    varName,
    boundVar: null,
    detail: `${varName || 'i'}: ${start} → ${end} step ${decreasing ? -delta : delta}`,
  };
}

/**
 * Resolve iterations when bound var has a numeric value from input chips.
 * @param {object} est — result from estimateForIterations (may include boundVar, start, op, …)
 * @param {Record<string, number>} env — variable name → number
 */
export function resolveIterationsWithEnv(est, env = {}) {
  if (!est) return { iterations: null, unbounded: true };
  if (est.iterations != null && Number.isFinite(est.iterations)) {
    return {
      iterations: est.iterations,
      unbounded: false,
      detail: est.detail,
      boundVar: null,
    };
  }
  const bv = est.boundVar;
  if (!bv || env[bv] == null || !Number.isFinite(Number(env[bv]))) {
    return {
      iterations: null,
      unbounded: true,
      boundVar: bv || null,
      detail: est.detail || 'waiting for bound input',
    };
  }
  const end = Number(env[bv]);
  const start = est.start != null ? est.start : 0;
  const op = est.op || '<=';
  const inclusive = !!est.inclusive || op === '<=' || op === '>=';
  const delta = est.delta || 1;
  const decreasing = !!est.decreasing;

  let count = null;
  if (!decreasing && (op === '<' || op === '<=')) {
    const last = inclusive ? end : end - 1;
    if (last < start) count = 0;
    else count = Math.floor((last - start) / delta) + 1;
  } else if (decreasing && (op === '>' || op === '>=')) {
    const last = inclusive ? end : end + 1;
    if (last > start) count = 0;
    else count = Math.floor((start - last) / delta) + 1;
  }

  if (count == null || !Number.isFinite(count) || count < 0) {
    return { iterations: null, unbounded: true, boundVar: bv, detail: 'could not resolve' };
  }
  return {
    iterations: count,
    unbounded: false,
    boundVar: bv,
    detail: `${est.varName || 'i'}: ${start} → ${bv}=${end} (${count}×)`,
  };
}

/**
 * Scan source for loop bodies and return ranges with estimated iterations.
 * @returns {Array<{ startLine: number, endLine: number, kind: string, iterations: number|null, unbounded: boolean, header: string, detail: string }>}
 */
export function findLoops(code) {
  const src = String(code || '');
  const lineStarts = buildLineStarts(src);
  const loops = [];

  // Match for / while / do at statement level (best-effort)
  const re = /\b(for|while|do)\b/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const kind = m[1];
    const kwStart = m.index;
    // skip if in comment/string — rough: check preceding for // or /*
    const lineStart = src.lastIndexOf('\n', kwStart) + 1;
    const before = src.slice(lineStart, kwStart);
    if (before.includes('//')) continue;

    let header = '';
    let bodyOpen = -1;

    if (kind === 'do') {
      // do { ... } while (...);
      bodyOpen = src.indexOf('{', kwStart);
      if (bodyOpen < 0) continue;
      const close = matchBrace(src, bodyOpen);
      if (close < 0) continue;
      const after = src.slice(close + 1, close + 80);
      const wm = after.match(/^\s*while\s*\(([\s\S]*?)\)\s*;/);
      header = wm ? `do-while (${wm[1].trim()})` : 'do-while';
      const startLine = offsetToLine(lineStarts, kwStart);
      const endLine = offsetToLine(lineStarts, close);
      loops.push({
        startLine,
        endLine,
        kind: 'do-while',
        iterations: null,
        unbounded: true,
        header,
        detail: 'do-while (unknown count)',
      });
      continue;
    }

    // for / while: keyword ( ... ) { or single statement
    const parenOpen = src.indexOf('(', kwStart);
    if (parenOpen < 0) continue;
    let depth = 0;
    let parenClose = -1;
    for (let i = parenOpen; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) {
          parenClose = i;
          break;
        }
      }
    }
    if (parenClose < 0) continue;
    header = src.slice(kwStart, parenClose + 1).replace(/\s+/g, ' ').trim();

    // body: { } or next statement until ;
    let endPos = parenClose + 1;
    const afterParen = src.slice(parenClose + 1).match(/^\s*\{/);
    if (afterParen) {
      bodyOpen = parenClose + 1 + afterParen[0].indexOf('{');
      // fix: index relative
      bodyOpen = src.indexOf('{', parenClose);
      const close = matchBrace(src, bodyOpen);
      if (close < 0) continue;
      endPos = close;
    } else {
      const semi = src.indexOf(';', parenClose + 1);
      if (semi < 0) continue;
      endPos = semi;
    }

    const startLine = offsetToLine(lineStarts, kwStart);
    const endLine = offsetToLine(lineStarts, endPos);

    let iterations = null;
    let unbounded = true;
    let detail = kind;
    /** @type {object|null} */
    let est = null;
    if (kind === 'for') {
      est = estimateForIterations(header);
      iterations = est.iterations;
      unbounded = est.unbounded;
      detail = est.detail;
    } else {
      detail = 'while (unknown count)';
    }

    loops.push({
      startLine,
      endLine,
      kind,
      iterations,
      unbounded,
      header: header.slice(0, 80),
      detail,
      boundVar: est?.boundVar || null,
      est, // full estimate for resolveIterationsWithEnv
    });
  }

  return loops;
}

/**
 * Innermost loop containing line (0-based), or null.
 */
export function getInnermostLoop(loops, line0) {
  let best = null;
  for (const L of loops) {
    if (line0 >= L.startLine && line0 <= L.endLine) {
      if (!best || L.endLine - L.startLine < best.endLine - best.startLine) {
        best = L;
      }
    }
  }
  return best;
}

/**
 * Resolve how many input rounds to collect for a site inside a loop.
 * Caps by maxLoopInputs. Optional env resolves bound variables (e.g. b from scanf).
 * If still unknown, returns rounds: null (caller may ask user).
 */
export function resolveLoopRounds(loop, maxLoopInputs = 100, env = null) {
  const max = Math.max(1, Math.min(10000, maxLoopInputs | 0 || 100));
  if (!loop) return { rounds: 1, capped: false, unknown: false, loop: null };

  let iterations = loop.iterations;
  let detail = loop.detail;
  let boundVar = loop.boundVar || null;

  if ((iterations == null || !Number.isFinite(iterations)) && env && loop.est) {
    const r = resolveIterationsWithEnv(loop.est, env);
    if (r.iterations != null && Number.isFinite(r.iterations)) {
      iterations = r.iterations;
      detail = r.detail;
      boundVar = r.boundVar;
    }
  } else if ((iterations == null || !Number.isFinite(iterations)) && env && boundVar && env[boundVar] != null) {
    const r = resolveIterationsWithEnv(
      {
        boundVar,
        start: loop.est?.start ?? 0,
        op: loop.est?.op || '<=',
        inclusive: loop.est?.inclusive,
        delta: loop.est?.delta || 1,
        decreasing: loop.est?.decreasing,
        varName: loop.est?.varName,
      },
      env
    );
    if (r.iterations != null) {
      iterations = r.iterations;
      detail = r.detail;
    }
  }

  if (iterations != null && Number.isFinite(iterations)) {
    const n = Math.max(0, Math.floor(iterations));
    if (n > max) {
      return {
        rounds: max,
        capped: true,
        unknown: false,
        loop,
        total: n,
        detail,
        boundVar,
      };
    }
    return {
      rounds: n,
      capped: false,
      unknown: false,
      loop,
      total: n,
      detail,
      boundVar,
    };
  }
  return {
    rounds: null,
    capped: false,
    unknown: true,
    loop,
    boundVar,
    detail: detail || 'unknown',
  };
}

/**
 * Expand pattern fill for loop rounds.
 * mode: 'same' | 'range' | 'expr'
 * - same: value repeated
 * - range: start, end, step (numeric) — fill remaining with last
 * - expr: start + op like +2, *2, -1 applied each step
 */
export function expandPattern(mode, opts, rounds) {
  const n = Math.max(0, rounds | 0);
  const out = [];
  if (n === 0) return out;

  if (mode === 'same') {
    const v = String(opts.value ?? '');
    for (let i = 0; i < n; i++) out.push(v);
    return out;
  }

  if (mode === 'range') {
    let cur = Number(opts.start);
    const end = Number(opts.end);
    const step = Number(opts.step);
    if (!Number.isFinite(cur)) cur = 0;
    const st = Number.isFinite(step) && step !== 0 ? step : 1;
    for (let i = 0; i < n; i++) {
      if (i > 0 && Number.isFinite(end)) {
        // stop stepping past end; fill rest with last
        const next = cur + st;
        const past =
          st > 0 ? next > end : st < 0 ? next < end : false;
        if (past && out.length) {
          while (out.length < n) out.push(out[out.length - 1]);
          break;
        }
        cur = next;
      }
      out.push(String(cur));
    }
    while (out.length < n) out.push(out[out.length - 1] ?? String(opts.start ?? ''));
    return out;
  }

  if (mode === 'expr') {
    let cur = Number(opts.start);
    if (!Number.isFinite(cur)) cur = 0;
    const op = String(opts.op || '+1').trim();
    const om = op.match(/^([+*\-\/])\s*([+-]?\d+(?:\.\d+)?)$/);
    const apply = (x) => {
      if (!om) return x + 1;
      const k = Number(om[2]);
      switch (om[1]) {
        case '+':
          return x + k;
        case '-':
          return x - k;
        case '*':
          return x * k;
        case '/':
          return k !== 0 ? x / k : x;
        default:
          return x + 1;
      }
    };
    for (let i = 0; i < n; i++) {
      out.push(String(cur));
      cur = apply(cur);
    }
    return out;
  }

  return out;
}
