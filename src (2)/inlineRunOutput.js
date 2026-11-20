/**
 * inlineRunOutput.js — Ephemeral inline run logs (ninja-style).
 * CM6: Decoration.widget so logs scroll with the line (no fixed DOM / z-index issues).
 * Clears on edit and on file switch.
 */

import { getSettings } from './settings.js';
import { findLoops, getInnermostLoop, resolveLoopRounds } from './loopInput.js';
import { clearChipsOnEdit } from './inputChips.js';

let compartment = null;
/** True while inline run logs are on screen; typing clears and sets false. */
let logsVisible = false;
/** Stable handler ref so we can off() the same function. */
let clearHandler = null;
/** @type {((e?: any) => void)|null} */
let switchHandler = null;
/** Document-level capture listeners attached once for the whole plugin lifetime. */
let docClearAttached = false;
/** CM6 updateListener extension compartment (separate from decorations). */
let updateCompartment = null;
/** Which editor instance currently has change listeners. */
let boundEditor = null;

function stripAnsi(s) {
  return String(s || '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\([A-Z]/g, '')
    .replace(/\033\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Prepare a single log fragment for on-screen display:
 * - real newlines → ↵ (so widgets never wrap / push previous lines)
 * - other control whitespace collapsed to spaces
 */
function formatLogFragment(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '↵')
    .replace(/\t/g, ' ')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    // trim spaces only — keep leading/trailing ↵
    .replace(/^[ \t]+|[ \t]+$/g, '');
}

function formatLogLabel(texts) {
  return (Array.isArray(texts) ? texts : [texts])
    .map(formatLogFragment)
    .filter((t) => t.length)
    .join(' · ');
}

/** Read editor theme number token color (CM6 / Ace / CSS vars). */
function getEditorNumberColor() {
  try {
    const probes = [
      '.cm-number',
      '.tok-number',
      '.ͼc', // common CM6 number class variant
      'span[class*="number"]',
      '.ace_numeric',
      '.ace_constant.ace_numeric',
    ];
    for (const sel of probes) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const c = getComputedStyle(el).color;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
    }
  } catch (_) {}
  try {
    const root = getComputedStyle(document.documentElement);
    for (const v of ['--cm-number', '--syntax-number', '--number-color', '--accent-color']) {
      const c = root.getPropertyValue(v)?.trim();
      if (c) return c;
    }
  } catch (_) {}
  return '#b5cea8'; // VS Code dark number-ish fallback
}

/**
 * Build DOM for log label: pure numeric tokens get number color.
 * Digits inside words / mixed alphanumerics stay default (not "numbers inside strings").
 */
function fillLogDom(container, label, numberColor) {
  const numRe = /([+-]?(?:\d+\.\d+|\d+\.|\.\d+|\d+)(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let m;
  const s = String(label || '');
  while ((m = numRe.exec(s)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    // Skip if adjacent to letter/underscore → part of identifier / word
    const before = start > 0 ? s[start - 1] : '';
    const after = end < s.length ? s[end] : '';
    const glued =
      (before && /[A-Za-z_]/.test(before)) || (after && /[A-Za-z_]/.test(after));
    if (start > last) {
      container.appendChild(document.createTextNode(s.slice(last, start)));
    }
    if (glued) {
      container.appendChild(document.createTextNode(m[0]));
    } else {
      const span = document.createElement('span');
      span.className = 'cm-cpp-inline-run-num';
      span.style.color = numberColor;
      span.style.fontStyle = 'normal';
      span.textContent = m[0];
      container.appendChild(span);
    }
    last = end;
  }
  if (last < s.length) {
    container.appendChild(document.createTextNode(s.slice(last)));
  }
  if (!s) container.appendChild(document.createTextNode(''));
}

function isMetaLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^\[compile\]/i.test(t)) return true;
  if (/^\[compile failed\]/i.test(t)) return true;
  if (/^\[run\]/i.test(t)) return true;
  if (/^\[cmd\]/i.test(t)) return true;
  if (/^\[file\]/i.test(t)) return true;
  if (/^\[Process exited/i.test(t)) return true;
  if (/^\[Time /i.test(t)) return true;
  if (/^CPP_RUN_/i.test(t)) return true;
  if (/CPP_RUN_END/i.test(t) && !/[a-z]{3,}/i.test(t.replace(/CPP_RUN_END/ig, ''))) return true;
  if (/^__CPP_OUT_FILE__/i.test(t)) return true;
  if (/^---$/.test(t)) return true;
  if (/^\[Om\b/i.test(t) || /^\[0m/i.test(t)) return true;
  return false;
}

/** Strip runner meta markers that may be glued to program stdout (no separating \\n). */
function scrubMetaFromOutput(output) {
  return String(output || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/CPP_RUN_END/g, '')
    .replace(/__CPP_OUT_FILE__\S*/g, '')
    .replace(/\n\[Process exited[^\n]*/gi, '')
    .replace(/\n\[Time [^\n]*/gi, '')
    .replace(/\n\[compile failed\][^\n]*/gi, '\n[compile failed]')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Detect compile/runtime error payload (for popup instead of inline).
 */
export function isErrorOutput(output) {
  const s = stripAnsi(scrubMetaFromOutput(output));
  if (/\[compile failed\]/i.test(s)) return true;
  // gcc/clang diagnostics
  if (/:\d+:\d+:\s*(fatal )?error:/i.test(s)) return true;
  if (/:\d+:\d+:\s*warning:/i.test(s) && /error:/i.test(s)) return true;
  if (/\berror:\s+/i.test(s) && /undefined reference|collect2|ld returned/i.test(s)) return true;
  return false;
}

/**
 * Extract match info from a print source line.
 * @returns {{ needle: string, leadingNL: number, trailingNL: number, internalNL: number }|null}
 */
function extractPrintLiteral(line) {
  const s = String(line || '');
  /** @type {{ needle: string, leadingNL: number, trailingNL: number, internalNL: number, score: number }[]} */
  const literals = [];
  const re = /(["'])(?:\\.|(?!\1).)*\1/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    let lit = m[0].slice(1, -1);
    lit = lit
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
    const fullFormat = lit;
    const pct = lit.search(/%[0-9#0 +\-]*\.?[0-9]*[diuoxXfFeEgGaAcspn%]/);
    let body = pct >= 0 ? lit.slice(0, pct) : lit;
    const leadingNL = (body.match(/^\n+/) || [''])[0].length;
    const trailingNL = (body.match(/\n+$/) || [''])[0].length;
    body = body.replace(/^\n+/, '').replace(/\n+$/, '');
    const internalNL = (body.match(/\n/g) || []).length;
    // Prefer static prefix as needle; keep fullFormat for loop splitting when % is present
    const needle = body;
    const score = needle.replace(/\n/g, '').trim().length + (pct >= 0 ? 2 : 0);
    if (score >= 1 || leadingNL > 0 || pct >= 0) {
      literals.push({
        needle,
        fullFormat,
        hasSpec: pct >= 0,
        leadingNL,
        trailingNL,
        internalNL,
        score: Math.max(score, pct >= 0 ? 3 : score),
      });
    }
  }
  if (!literals.length && /<<\s*["']/.test(s)) {
    const m2 = s.match(/<<\s*(["'])((?:\\.|(?!\1).)*)\1/);
    if (m2) {
      let lit = m2[2]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
      const pct = lit.search(/%/);
      if (pct >= 0) lit = lit.slice(0, pct);
      const leadingNL = (lit.match(/^\n+/) || [''])[0].length;
      const trailingNL = (lit.match(/\n+$/) || [''])[0].length;
      lit = lit.replace(/^\n+/, '').replace(/\n+$/, '');
      literals.push({
        needle: lit,
        leadingNL,
        trailingNL,
        internalNL: (lit.match(/\n/g) || []).length,
        score: lit.trim().length,
      });
    }
  }
  // also puts("...") always ends with newline conceptually
  if (/\bputs\s*\(/.test(s) && literals.length) {
    literals[0].trailingNL = Math.max(literals[0].trailingNL, 1);
  }
  literals.sort((a, b) => b.score - a.score);
  return literals[0] || null;
}

/**
 * Attach ↵ markers from format-string newline counts + any real \\n still in text.
 */
function applyNewlineMarkers(text, site) {
  let t = String(text || '');
  // real newlines still present → ↵
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let prefix = '';
  let suffix = '';
  if (site?.leadingNL > 0) prefix = '↵'.repeat(site.leadingNL);
  if (site?.trailingNL > 0) suffix = '↵'.repeat(Math.min(site.trailingNL, 2));
  // internal newlines in captured text
  t = t.replace(/\n/g, '↵');
  // if format had internal \\n but capture lost them (split), keep text as-is —
  // leading/trailing markers still show that the printf emitted newlines.
  const out = (prefix + t + suffix).replace(/↵{3,}/g, '↵↵');
  return out;
}


/** Escape for RegExp source */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a global regex that matches one printf iteration from a format string.
 * e.g. "%d Hello this is test " → /\d+ Hello this is test /g
 */
function printfFormatToRegex(fmt) {
  const f = String(fmt || '');
  if (!f) return null;
  let re = '';
  let i = 0;
  while (i < f.length) {
    if (f[i] === '%' && i + 1 < f.length) {
      if (f[i + 1] === '%') {
        re += '%';
        i += 2;
        continue;
      }
      let j = i + 1;
      while (j < f.length && /[-+#0 \d.]/.test(f[j])) j++;
      const spec = f[j] || 's';
      if (/[diouxX]/.test(spec)) re += '\\d+';
      else if (spec === 'c') re += '[\\s\\S]';
      else if (/[eEfFgGaA]/.test(spec)) re += '[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?';
      else re += '[\\s\\S]+?';
      i = j + 1;
    } else {
      re += escapeRe(f[i]);
      i++;
    }
  }
  if (!re) return null;
  try {
    return new RegExp(re, 'g');
  } catch (_) {
    return null;
  }
}

/**
 * Split one physical stdout blob into per-iteration strings for a loop print.
 */
function splitLoopOutput(text, info, rounds) {
  const raw = String(text || '');
  const n = Math.max(1, rounds | 0);
  if (n <= 1) return raw ? [raw] : [];

  // Prefer newline-separated
  const byNl = raw.split('\n').filter((l) => l.length > 0);
  if (byNl.length >= n) return byNl.slice(0, n);
  if (byNl.length > 1 && byNl.length >= Math.ceil(n / 2)) return byNl;

  const fmt = (info && (info.fullFormat || info.needle)) || '';
  const re = printfFormatToRegex(fmt);
  if (re) {
    const hits = raw.match(re);
    if (hits && hits.length) return hits.slice(0, n);
  }

  // Static separator (longest non-empty static chunk)
  const staticParts = String(fmt)
    .split(/%[0-9#0 +\-]*\.?[0-9]*[diuoxXfFeEgGaAcspn%]/)
    .filter((s) => s.length >= 2);
  staticParts.sort((a, b) => b.length - a.length);
  if (staticParts[0]) {
    const sep = staticParts[0];
    const parts = [];
    let rest = raw;
    for (let r = 0; r < n && rest.length; r++) {
      if (r === n - 1) {
        parts.push(rest);
        break;
      }
      const idx = rest.indexOf(sep);
      if (idx === -1) {
        parts.push(rest);
        rest = '';
        break;
      }
      const end = idx + sep.length;
      parts.push(rest.slice(0, end));
      rest = rest.slice(end);
    }
    if (parts.length > 1) return parts;
  }

  return raw ? [raw] : [];
}

function mapOutputToPrintLines(code, output) {
  const codeLines = String(code || '').split('\n');
  /** @type {{ idx: number, lit: ReturnType<typeof extractPrintLiteral> }[]} */
  const printSites = [];
  let loops = [];
  try {
    loops = findLoops(code);
  } catch (_) {}
  const maxLoop = getSettings().maxLoopInputs ?? 100;
  for (let i = 0; i < codeLines.length; i++) {
    if (
      /\b(printf|puts|putchar|cout|cerr|clog|wprintf)\b/.test(codeLines[i]) ||
      /<<\s*["']/.test(codeLines[i])
    ) {
      let loopRounds = 1;
      try {
        const loop = getInnermostLoop(loops, i);
        if (loop) {
          const resolved = resolveLoopRounds(loop, maxLoop, null);
          if (resolved.rounds != null && resolved.rounds > 0) {
            loopRounds = Math.max(1, resolved.rounds);
          }
        }
      } catch (_) {}
      printSites.push({ idx: i, lit: extractPrintLiteral(codeLines[i]), loopRounds });
    }
  }

  const cleaned = scrubMetaFromOutput(stripAnsi(output));
  // Keep empty lines as placeholders only between content — but do not drop
  // content lines. Meta lines removed.
  const rawLines = cleaned.split('\n').map((l) => l.replace(/\r$/, ''));
  const outLines = [];
  for (const l of rawLines) {
    if (isMetaLine(l) && l.trim()) continue;
    outLines.push(l);
  }
  // Trim leading/trailing empty lines only
  while (outLines.length && !outLines[0].trim()) outLines.shift();
  while (outLines.length && !outLines[outLines.length - 1].trim()) outLines.pop();

  /** @type {Map<number, string[]>} */
  const map = new Map();
  if (!outLines.length) return map;

  if (!printSites.length) {
    let last = codeLines.length - 1;
    while (last > 0 && !codeLines[last].trim()) last--;
    map.set(last, outLines.filter((l) => l.trim()));
    return map;
  }

  // Flatten keeping \\n so we can re-attach leading newlines to the right site
  let stream = outLines.join('\n');
  const used = new Set();

  for (const site of printSites) {
    const info = site.lit;
    if (!info) continue;
    const needle = info.needle;
    const rounds = Math.max(1, site.loopRounds || 1);

    // Empty static needle (e.g. printf("%d Hello…") starts with %)
    if (!needle.replace(/\n/g, '').trim()) {
      if (info.hasSpec || info.fullFormat) {
        // Grab stream until next different site's literal (or end)
        let endPos = stream.length;
        for (const other of printSites) {
          if (other.idx === site.idx || !other.lit) continue;
          const on = (other.lit.needle || '').replace(/\n/g, '');
          if (!on.trim()) continue;
          let p = stream.indexOf(other.lit.needle);
          if (p === -1) p = stream.indexOf(on);
          if (p !== -1 && p < endPos) endPos = p;
        }
        let blob = stream.slice(0, endPos);
        stream = stream.slice(endPos);
        // drop trailing newline only if next site will want it
        if (blob.endsWith('\n') && endPos < stream.length + blob.length) {
          /* keep in blob; splitLoopOutput handles */
        }
        const pieces = splitLoopOutput(blob.replace(/^\n/, '').replace(/\n$/, ''), info, rounds);
        if (!map.has(site.idx)) map.set(site.idx, []);
        for (const piece of pieces) {
          const d = applyNewlineMarkers(piece, info);
          if (d) map.get(site.idx).push(d);
        }
        if (map.get(site.idx).length) used.add(site.idx);
        continue;
      }
      if (info.leadingNL || info.trailingNL) {
        if (!map.has(site.idx)) map.set(site.idx, []);
        for (let r = 0; r < rounds; r++) {
          map.get(site.idx).push(applyNewlineMarkers('', info));
        }
        used.add(site.idx);
      }
      continue;
    }

    const searchNeedle = needle.replace(/\n/g, '');
    let matchedAny = false;

    for (let r = 0; r < rounds; r++) {
      let pos = stream.indexOf(needle);
      if (pos === -1 && searchNeedle !== needle) pos = stream.indexOf(searchNeedle);
      if (pos === -1) break;

      const matchLen = stream.startsWith(needle, pos) ? needle.length : searchNeedle.length;
      let startPos = pos;
      if (info.leadingNL > 0 && startPos > 0 && stream[startPos - 1] === '\n') {
        startPos -= 1;
      }

      const after = pos + matchLen;
      let endPos = stream.length;
      let nextLitPos = -1;
      for (const other of printSites) {
        if (other.idx === site.idx || !other.lit) continue;
        const on = (other.lit.needle || '').replace(/\n/g, '');
        if (!on.trim()) continue;
        let p = stream.indexOf(other.lit.needle, after);
        if (p === -1) p = stream.indexOf(on, after);
        if (p !== -1 && (nextLitPos === -1 || p < nextLitPos)) nextLitPos = p;
      }
      if (r < rounds - 1) {
        let selfNext = stream.indexOf(needle, after);
        if (selfNext === -1 && searchNeedle !== needle) {
          selfNext = stream.indexOf(searchNeedle, after);
        }
        if (selfNext !== -1 && (nextLitPos === -1 || selfNext < nextLitPos)) {
          nextLitPos = selfNext;
        }
      }

      if (nextLitPos !== -1) {
        endPos = nextLitPos;
        if (endPos > after && stream[endPos - 1] === '\n') endPos -= 1;
      } else {
        const nl = stream.indexOf('\n', after);
        if (info.trailingNL > 0 && nl !== -1) endPos = nl + 1;
        else if (nl !== -1) endPos = nl;
      }

      let fragment = stream.slice(startPos, endPos);
      fragment = fragment.replace(/^\n/, '').replace(/\n$/, '');
      const display = applyNewlineMarkers(fragment, info);
      if (display.trim() || info.leadingNL || info.trailingNL) {
        if (!map.has(site.idx)) map.set(site.idx, []);
        map.get(site.idx).push(display || '↵');
        matchedAny = true;
      }
      stream = stream.slice(0, startPos) + stream.slice(endPos);
    }
    if (matchedAny) used.add(site.idx);
  }


  // Expand single-blob loop prints into one entry per iteration (block UI)
  for (const site of printSites) {
    const rounds = Math.max(1, site.loopRounds || 1);
    if (rounds <= 1) continue;
    const arr = map.get(site.idx);
    if (!arr || !arr.length) continue;
    if (arr.length >= rounds) continue;
    // Join current fragments and re-split by format / static text
    const joined = arr.join('');
    const pieces = splitLoopOutput(joined, site.lit, rounds);
    if (pieces.length > 1) {
      map.set(
        site.idx,
        pieces.map((x) => applyNewlineMarkers(x, site.lit)).filter(Boolean)
      );
    }
  }

  const remaining = stream
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length);

  const unusedSites = printSites.filter((s) => !used.has(s.idx));
  let ui = 0;
  for (const line of remaining) {
    if (!unusedSites.length) {
      const last = printSites[printSites.length - 1].idx;
      if (!map.has(last)) map.set(last, []);
      map.get(last).push(formatLogFragment(line));
      continue;
    }
    const site = unusedSites[Math.min(ui, unusedSites.length - 1)];
    if (!map.has(site.idx)) map.set(site.idx, []);
    map.get(site.idx).push(formatLogFragment(line));
    if (ui < unusedSites.length - 1) ui++;
  }

  return map;
}

function clearDomFallback() {
  document.querySelectorAll('.acode-cpp-inline-run-log').forEach((el) => el.remove());
  document.querySelectorAll('[data-cpp-inline-run]').forEach((el) => el.remove());
}

function clearCm6Decorations(editor) {
  if (!editor?.dispatch || !compartment) return;
  try {
    const cmState = acode.require('@codemirror/state');
    if (!cmState) return;
    const existing = compartment.get(editor.state);
    if (existing !== undefined) {
      editor.dispatch({ effects: compartment.reconfigure([]) });
    }
  } catch (_) {}
}

function detachEditorClearListeners(ed) {
  if (!clearHandler || !ed) return;
  try {
    if (ed.session?.off) ed.session.off('change', clearHandler);
  } catch (_) {}
  try {
    if (typeof ed.off === 'function') ed.off('change', clearHandler);
  } catch (_) {}
  try {
    ed.dom?.removeEventListener?.('input', clearHandler);
    ed.dom?.removeEventListener?.('keydown', clearHandler);
  } catch (_) {}
  try {
    editorManager?.off?.('update', clearHandler);
  } catch (_) {}
}

export function clearInlineRunOutput(editor) {
  const ed = editor || editorManager?.editor || boundEditor;
  logsVisible = false;
  clearDomFallback();
  clearCm6Decorations(ed);
  // Drop CM6 updateListener so we don't keep reacting after logs are gone
  try {
    if (ed?.dispatch && updateCompartment) {
      const cmState = acode.require('@codemirror/state');
      if (cmState) {
        const existing = updateCompartment.get(ed.state);
        if (existing !== undefined) {
          ed.dispatch({ effects: updateCompartment.reconfigure([]) });
        }
      }
    }
  } catch (_) {}
  detachEditorClearListeners(ed);
  boundEditor = null;
}

function isEditorTypingTarget(target) {
  if (!target || !target.closest) return false;
  return !!(
    target.closest('.cm-content') ||
    target.closest('.cm-editor') ||
    target.closest('.ace_editor') ||
    target.closest('.ace_content') ||
    target.closest('[contenteditable="true"]')
  );
}

function onUserEdit() {
  if (!logsVisible) return;
  logsVisible = false;
  const ed = boundEditor || editorManager?.editor;
  clearInlineRunOutput(ed);
  try {
    clearChipsOnEdit();
  } catch (_) {}
}

function attachClearOnType(editor) {
  logsVisible = true;
  boundEditor = editor || editorManager?.editor;

  // One stable function identity for the lifetime of the module
  if (!clearHandler) {
    clearHandler = () => onUserEdit();
  }

  // Avoid stacking: detach from previous editor first
  detachEditorClearListeners(boundEditor);

  // Ace session
  try {
    if (boundEditor?.session?.on) boundEditor.session.on('change', clearHandler);
  } catch (_) {}

  // Acode CM6 wrapper often exposes editor.on('change')
  try {
    if (typeof boundEditor?.on === 'function') boundEditor.on('change', clearHandler);
  } catch (_) {}

  try {
    boundEditor?.dom?.addEventListener?.('input', clearHandler);
    boundEditor?.dom?.addEventListener?.('keydown', clearHandler);
  } catch (_) {}

  // CM6 native: updateListener fires on every doc transaction
  try {
    const isCM6 = typeof boundEditor?.dispatch === 'function' && boundEditor?.state?.doc;
    if (isCM6) {
      const cmView = acode.require('@codemirror/view');
      const cmState = acode.require('@codemirror/state');
      if (cmView?.EditorView?.updateListener && cmState?.Compartment) {
        if (!updateCompartment) updateCompartment = new cmState.Compartment();
        const listener = cmView.EditorView.updateListener.of((update) => {
          if (!logsVisible) return;
          if (update.docChanged) onUserEdit();
        });
        const existing = updateCompartment.get(boundEditor.state);
        if (existing === undefined) {
          boundEditor.dispatch({
            effects: cmState.StateEffect.appendConfig.of(updateCompartment.of(listener)),
          });
        } else {
          boundEditor.dispatch({ effects: updateCompartment.reconfigure(listener) });
        }
      }
    }
  } catch (_) {}

  // Document capture — survives focus quirks in WebView (same pattern as initPlugin)
  if (!docClearAttached) {
    docClearAttached = true;
    const docHandler = (e) => {
      if (!logsVisible) return;
      if (isEditorTypingTarget(e.target)) onUserEdit();
    };
    try {
      document.addEventListener('beforeinput', docHandler, true);
      document.addEventListener('input', docHandler, true);
      document.addEventListener(
        'keydown',
        (e) => {
          if (!logsVisible) return;
          const k = e.key || '';
          if (
            k.length === 1 ||
            k === 'Backspace' ||
            k === 'Delete' ||
            k === 'Enter' ||
            k === 'Tab' ||
            (e.ctrlKey && (k === 'v' || k === 'x' || k === 'z')) ||
            (e.metaKey && (k === 'v' || k === 'x' || k === 'z'))
          ) {
            if (isEditorTypingTarget(e.target)) onUserEdit();
          }
        },
        true
      );
      document.addEventListener('paste', docHandler, true);
    } catch (_) {}
  }
}

export function initInlineRunOutput() {
  if (switchHandler) return;
  switchHandler = () => {
    clearInlineRunOutput();
  };
  try {
    editorManager.on('switch-file', switchHandler);
  } catch (_) {}
}

export function destroyInlineRunOutput() {
  clearInlineRunOutput();
  if (switchHandler) {
    try {
      editorManager.off('switch-file', switchHandler);
    } catch (_) {}
    switchHandler = null;
  }
}

export function showInlineRunOutput(code, output) {
  const settings = getSettings();
  if (settings.enableInlineRunLogs === false) return;

  const editor = editorManager?.editor;
  clearInlineRunOutput(editor);
  if (!editor) return;

  const logMap = mapOutputToPrintLines(code, output);
  if (!logMap.size) return;

  const isCM6 = typeof editor.dispatch === 'function' && editor.state?.doc;

  if (isCM6) {
    const cmView = acode.require('@codemirror/view');
    const cmState = acode.require('@codemirror/state');
    if (cmView?.Decoration && cmView?.WidgetType && cmState?.Compartment && cmView?.EditorView) {
      if (!compartment) compartment = new cmState.Compartment();

      const numberColor = getEditorNumberColor();

      class GhostWidget extends cmView.WidgetType {
        constructor(label) {
          super();
          this.label = label;
        }
        eq(other) {
          return other instanceof GhostWidget && other.label === this.label;
        }
        toDOM() {
          const span = document.createElement('span');
          span.className = 'cm-cpp-inline-run-log';
          span.setAttribute('data-cpp-inline-run', '1');
          span.contentEditable = 'false';
          span.appendChild(document.createTextNode('  ⟹ '));
          fillLogDom(span, this.label, numberColor);
          return span;
        }
        ignoreEvent() {
          return true;
        }
      }

      /** Multi-iteration loop prints — block widget expands space under the line */
      class GhostBlock extends cmView.WidgetType {
        constructor(texts) {
          super();
          this.texts = texts || [];
        }
        eq(other) {
          return (
            other instanceof GhostBlock &&
            other.texts.length === this.texts.length &&
            other.texts.every((x, i) => x === this.texts[i])
          );
        }
        toDOM() {
          const wrap = document.createElement('div');
          wrap.className = 'cm-cpp-inline-log-block';
          wrap.setAttribute('data-cpp-inline-run', '1');
          wrap.style.cssText =
            'display:block;padding:2px 0 4px 1.2em;margin:1px 0 4px;border-left:2px solid rgba(128,203,196,0.45);';
          for (let i = 0; i < this.texts.length; i++) {
            const row = document.createElement('div');
            row.className = 'cm-cpp-inline-run-log';
            row.style.cssText =
              'opacity:0.9;font-size:0.88em;white-space:pre;font-style:italic;color:#80cbc4;line-height:1.35;';
            row.textContent = this.texts[i];
            wrap.appendChild(row);
          }
          return wrap;
        }
        get estimatedHeight() {
          return Math.max(16, this.texts.length * 16);
        }
        ignoreEvent() {
          return true;
        }
      }

      const ranges = [];
      const doc = editor.state.doc;
      logMap.forEach((texts, lineIdx) => {
        try {
          const lineNo = Math.min(lineIdx + 1, doc.lines);
          const line = doc.line(lineNo);
          const arr = (Array.isArray(texts) ? texts : [texts])
            .map(formatLogFragment)
            .filter((x) => x && x.length);
          if (!arr.length) return;
          if (arr.length === 1) {
            ranges.push(
              cmView.Decoration.widget({
                widget: new GhostWidget(arr[0]),
                side: 1,
                block: false,
              }).range(line.to)
            );
          } else {
            ranges.push(
              cmView.Decoration.widget({
                widget: new GhostBlock(arr),
                side: 1,
                block: true,
              }).range(line.to)
            );
          }
        } catch (_) {}
      });

      if (ranges.length) {
        ranges.sort((a, b) => a.from - b.from);
        const decoSet = cmView.Decoration.set(ranges, true);
        const decorationsExt = cmView.EditorView.decorations.of(decoSet);
        try {
          const existing = compartment.get(editor.state);
          if (existing === undefined) {
            editor.dispatch({
              effects: cmState.StateEffect.appendConfig.of(compartment.of(decorationsExt)),
            });
          } else {
            editor.dispatch({ effects: compartment.reconfigure(decorationsExt) });
          }
          attachClearOnType(editor);
          return;
        } catch (e) {
          console.warn('[InlineRun] CM6 decoration failed, DOM fallback', e);
        }
      }
    }

    try {
      const content = editor.dom?.querySelector?.('.cm-content');
      const lines = content?.querySelectorAll?.('.cm-line');
      const numberColor = getEditorNumberColor();
      if (lines) {
        logMap.forEach((texts, lineIdx) => {
          if (lines[lineIdx]) {
            const span = document.createElement('span');
            span.className = 'cm-cpp-inline-run-log';
            span.dataset.cppInlineRun = '1';
            span.appendChild(document.createTextNode('  ⟹ '));
            fillLogDom(span, formatLogLabel(texts), numberColor);
            lines[lineIdx].appendChild(span);
          }
        });
        attachClearOnType(editor);
        return;
      }
    } catch (_) {}
  }

  if (editor.renderer) {
    const renderer = editor.renderer;
    const first = renderer.getFirstVisibleRow();
    const last = renderer.getLastVisibleRow();
    const numberColor = getEditorNumberColor();
    for (const [line0, texts] of logMap) {
      if (line0 < first || line0 > last) continue;
      try {
        const lineContent = editor.session.getLine(line0) || '';
        const coords = renderer.textToScreenCoordinates(line0, lineContent.length);
        if (!coords) continue;
        const el = document.createElement('span');
        el.className = 'acode-cpp-inline-run-log';
        el.appendChild(document.createTextNode('⟹ '));
        fillLogDom(el, formatLogLabel(texts), numberColor);
        el.style.cssText = `
          position: fixed;
          left: ${coords.pageX + 10}px;
          top: ${coords.pageY}px;
          z-index: 5;
          pointer-events: none;
          font-size: 11px;
          font-family: monospace;
          font-style: italic;
          color: #80cbc4;
          background: rgba(0,40,40,0.55);
          padding: 1px 8px;
          border-radius: 3px;
          max-width: 50vw;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        `;
        document.body.appendChild(el);
      } catch (_) {}
    }
    attachClearOnType(editor);
  }
}
