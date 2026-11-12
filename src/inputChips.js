/**
 * inputChips.js — Small chips on scanf / cin lines.
 * CM6: Decoration.widget (scrolls with line, stays inside editor).
 * Double-tap chip → Acode prompt (number keyboard when numeric).
 * Any document edit clears stored values.
 */

import { getSettings } from './settings.js';
import {
  findLoops,
  getInnermostLoop,
  resolveLoopRounds,
  expandPattern,
} from './loopInput.js';

/**
 * Build name→number env from stored chip values (for resolving for(i<=b) etc.).
 * Uses first slot of each non-loop site (or first round of loop sites).
 */
function buildInputEnv(fileKeyHint) {
  const key = fileKeyHint || fileKey(editorManager?.activeFile);
  const map = valueStore.get(key);
  if (!map) return {};
  const code = readCode();
  const sites = findInputSitesRaw(code); // without loop annotation to avoid recursion
  /** @type {Record<string, number>} */
  const env = {};
  for (const s of sites) {
    const stored = map.get(s.line);
    if (stored == null) continue;
    let firstVal = null;
    const pack = getLoopPackage(stored);
    if (pack && pack.data[0]) {
      firstVal = Array.isArray(pack.data[0]) ? pack.data[0][0] : pack.data[0];
    } else if (Array.isArray(stored)) {
      firstVal = stored[0];
    } else if (typeof stored === 'string') {
      firstVal = stored.split(/\s+/)[0];
    }
    if (firstVal == null || firstVal === '') continue;
    const num = Number(firstVal);
    if (!Number.isFinite(num)) continue;
    for (const slot of s.slots || []) {
      if (slot.varName) env[slot.varName] = num;
    }
  }
  return env;
}

/**
 * Like findInputSites but skip loop annotation (used while building env).
 */
function findInputSitesRaw(code) {
  // temporarily: call full findInputSites — loop annotation uses env optionally
  // to avoid recursion, we mark a flag
  return findInputSites(code, { skipLoopAnnotate: true });
}

const prompt = acode.require('prompt');
const toast = acode.require('toast');
const select = acode.require('select');

/**
 * valueStore: fileKey → Map<line0, stored>
 * stored shapes:
 *  - string[]              → one read, per-slot values (non-loop)
 *  - { rounds, data: string[][] } → loop: data[r] = slot values for round r
 *  - string (legacy)
 */
/** @type {Map<string, Map<number, any>>} */
const valueStore = new Map();

let refreshTimer = null;
let compartment = null;
let changeClearAttached = false;
let lastCodeSnapshot = '';
/** Prevents double prompt (dblclick + double-tap both firing). */
let promptOpen = false;
/** CM6 updateListener compartment — clears chip values on any doc edit. */
let chipUpdateCompartment = null;
/** Debounce rapid key events so we clear once per burst. */
let clearValuesTimer = null;

function fileKey(file) {
  if (!file) return 'untitled';
  return file.uri || file.filename || 'untitled';
}

function readCode() {
  const editor = editorManager?.editor;
  if (!editor) return '';
  if (typeof editor.dispatch === 'function' && editor.state?.doc) {
    return editor.state.doc.toString();
  }
  if (editor.session?.getValue) return editor.session.getValue();
  return '';
}

/** Map scanf conversion specifier → human datatype label + keyboard kind. */
function specToTypeInfo(specChar, lengthMod = '') {
  const c = String(specChar || '');
  const L = String(lengthMod || '');
  // strings / chars → text keyboard
  if (c === 's' || c === '[' || c === 'c') {
    return {
      dataType: c === 'c' ? 'char' : c === '[' ? 'scanset' : 'string (%s)',
      promptType: 'text',
    };
  }
  if (c === 'p') return { dataType: 'pointer', promptType: 'text' };
  if (c === 'n') return { dataType: 'int* (count)', promptType: 'number' };

  // floating
  if ('fFeEgGaA'.includes(c)) {
    if (L === 'L') return { dataType: 'long double', promptType: 'number' };
    if (L === 'l') return { dataType: 'double', promptType: 'number' };
    return { dataType: 'float', promptType: 'number' };
  }

  // integers
  if ('di'.includes(c)) {
    if (L === 'll') return { dataType: 'long long', promptType: 'number' };
    if (L === 'l') return { dataType: 'long', promptType: 'number' };
    if (L === 'hh') return { dataType: 'signed char', promptType: 'number' };
    if (L === 'h') return { dataType: 'short', promptType: 'number' };
    return { dataType: 'int', promptType: 'number' };
  }
  if (c === 'u' || c === 'o' || c === 'x' || c === 'X') {
    const base = c === 'o' ? 'octal' : c === 'x' || c === 'X' ? 'hex' : 'unsigned';
    if (L === 'll') return { dataType: `unsigned long long (${base})`, promptType: 'number' };
    if (L === 'l') return { dataType: `unsigned long (${base})`, promptType: 'number' };
    return { dataType: `${base}`, promptType: 'number' };
  }
  return { dataType: 'value', promptType: 'text' };
}

/**
 * Parse scanf/fscanf format into ordered slot descriptors (skips %% and %*).
 * @returns {{ spec: string, dataType: string, promptType: 'number'|'text' }[]}
 */
function parseScanfFormatSlots(format) {
  const f = String(format || '');
  const slots = [];
  const re =
    /%(\*?)(?:[0-9]+\$)?([- +#0]*)([0-9]*)(?:\.([0-9]*))?(hh|h|ll|l|L|j|z|t)?([diuoxXfFeEgGaAcspn%]|\[(?:[^\]]|\\\])*\])/g;
  let m;
  while ((m = re.exec(f)) !== null) {
    const suppressed = m[1] === '*';
    const lengthMod = m[5] || '';
    const conv = m[6] || '';
    if (conv === '%' || conv.startsWith('%')) continue;
    if (suppressed) continue;
    const specChar = conv[0] === '[' ? '[' : conv;
    const info = specToTypeInfo(specChar, lengthMod);
    const fullSpec = '%' + (lengthMod || '') + conv;
    slots.push({
      spec: fullSpec,
      dataType: info.dataType,
      promptType: info.promptType,
    });
  }
  return slots;
}

/** Extract &var / var names from scanf argument list (after format string). */
function extractScanfVarNames(line) {
  const s = String(line || '');
  // rough: after the format string closing quote, pull identifiers / &id
  const afterFmt = s.replace(/^[\s\S]*?scan[f]?\s*\([^,)]*["'][^"']*["']\s*,?\s*/i, '');
  const names = [];
  const re = /&?\s*([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(afterFmt)) !== null) {
    const id = m[1];
    // skip keywords / stdin
    if (/^(stdin|stdout|stderr|NULL|sizeof)$/.test(id)) continue;
    names.push(id);
  }
  return names;
}

/** cin >> a >> b >> c → variable names in order */
function extractCinVarNames(line) {
  const s = String(line || '');
  const idx = s.search(/\b(?:std\s*::\s*)?cin\s*>>/);
  if (idx === -1) return [];
  const rest = s.slice(idx);
  const names = [];
  const re = />>\s*([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(rest)) !== null) names.push(m[1]);
  return names;
}

/** Best-effort type from nearby declaration in the same file. */
function lookupDeclType(code, varName) {
  if (!varName) return null;
  const re = new RegExp(
    String.raw`\b(unsigned\s+long\s+long|long\s+long|unsigned\s+long|unsigned\s+int|unsigned\s+short|unsigned\s+char|long\s+double|double|float|int|short|char|bool|size_t|string|std\s*::\s*string)\b(?:\s+\w+)*\s+[^=;\n]*\b${varName}\b`,
    'i'
  );
  const m = String(code || '').match(re);
  if (!m) return null;
  return m[1].replace(/\s+/g, ' ').trim();
}

/**
 * Build ordered input slots for one source line.
 * Each slot → sequential prompt (NOT space-separated multi-entry).
 */
function buildSlotsForLine(line, kind, fullCode) {
  const s = String(line || '');

  if (kind === 'scanf' || kind === 'fscanf') {
    const fmt = s.match(/scan[^\n]*["']([^"']+)["']/);
    const fmtSlots = fmt ? parseScanfFormatSlots(fmt[1]) : [];
    const vars = extractScanfVarNames(s);
    if (!fmtSlots.length) {
      // fallback: one slot per &var
      if (vars.length) {
        return vars.map((v) => ({
          varName: v,
          spec: '?',
          dataType: lookupDeclType(fullCode, v) || 'value',
          promptType: 'text',
        }));
      }
      return [{ varName: 'input', spec: '?', dataType: 'value', promptType: 'text' }];
    }
    return fmtSlots.map((fs, i) => {
      const varName = vars[i] || `arg${i + 1}`;
      const decl = lookupDeclType(fullCode, varName);
      return {
        varName,
        spec: fs.spec,
        dataType: decl || fs.dataType,
        promptType: fs.promptType,
      };
    });
  }

  if (kind === 'cin') {
    const vars = extractCinVarNames(s);
    if (!vars.length) {
      return [{ varName: 'input', spec: 'cin', dataType: 'value', promptType: 'number' }];
    }
    return vars.map((v) => {
      const decl = lookupDeclType(fullCode, v);
      let promptType = 'number';
      let dataType = decl || 'value';
      if (decl && /string|char|wchar/i.test(decl)) promptType = 'text';
      else if (!decl) promptType = 'number';
      return { varName: v, spec: 'cin', dataType, promptType };
    });
  }

  if (kind === 'gets' || kind === 'fgets' || kind === 'getline') {
    const m =
      s.match(/\b(?:gets|fgets|getline)\s*\(\s*&?\s*([A-Za-z_]\w*)/) ||
      s.match(/>>\s*([A-Za-z_]\w*)/);
    const varName = m ? m[1] : 'line';
    return [
      {
        varName,
        spec: kind,
        dataType: lookupDeclType(fullCode, varName) || 'string (line)',
        promptType: 'text',
      },
    ];
  }

  if (kind === 'getchar') {
    return [{ varName: 'char', spec: '%c', dataType: 'char', promptType: 'text' }];
  }

  return [{ varName: 'input', spec: '?', dataType: 'value', promptType: 'text' }];
}

/**
 * Detect input sites — one chip per call site; slots[] for sequential prompts.
 * @param {string} code
 * @param {{ skipLoopAnnotate?: boolean }} [opts]
 */
export function findInputSites(code, opts = {}) {
  const fullCode = String(code || '');
  const lines = fullCode.split('\n');
  const sites = [];
  const patterns = [
    { re: /\bscanf\s*\(/, kind: 'scanf' },
    { re: /\bfscanf\s*\(/, kind: 'fscanf' },
    { re: /\bgets\s*\(/, kind: 'gets' },
    { re: /\bfgets\s*\(/, kind: 'fgets' },
    { re: /\bgetchar\s*\(/, kind: 'getchar' },
    { re: /\bcin\s*>>/, kind: 'cin' },
    { re: /\bstd\s*::\s*cin\s*>>/, kind: 'cin' },
    { re: /\bgetline\s*\(\s*(std\s*::\s*)?cin/, kind: 'getline' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) continue;
    for (const p of patterns) {
      if (p.re.test(line)) {
        const preview = trimmed.length > 42 ? trimmed.slice(0, 40) + '…' : trimmed;
        const slots = buildSlotsForLine(line, p.kind, fullCode);
        const count = slots.length;
        const promptType =
          count === 1 ? slots[0].promptType : slots.every((x) => x.promptType === 'number') ? 'number' : 'text';
        sites.push({
          line: i,
          kind: p.kind,
          preview,
          promptType,
          sourceLine: line,
          count,
          slots,
          loopRounds: 1,
          loopDetail: '',
          loopBoundVar: null,
        });
        break;
      }
    }
  }

  if (opts.skipLoopAnnotate) return sites;

  // Annotate sites inside loops — resolve bounds from already-entered input vars (e.g. b)
  try {
    const loops = findLoops(fullCode);
    const maxLoop = getSettings().maxLoopInputs ?? 100;
    const env = buildInputEnv(fileKey(editorManager?.activeFile));
    for (const site of sites) {
      const loop = getInnermostLoop(loops, site.line);
      if (!loop) continue;
      const resolved = resolveLoopRounds(loop, maxLoop, env);
      site.loopRounds = resolved.rounds != null ? Math.max(1, resolved.rounds) : 0;
      site.loopUnknown = !!resolved.unknown;
      site.loopCapped = !!resolved.capped;
      site.loopDetail = resolved.detail || loop.detail || loop.header || '';
      site.loopKind = loop.kind;
      site.loopBoundVar = resolved.boundVar || loop.boundVar || null;
    }
  } catch (_) {}

  return sites;
}

/** Normalize one round of slot values → complete string[] or null. */
function asSlotArray(roundStored, count) {
  if (roundStored == null) return null;
  if (Array.isArray(roundStored)) {
    if (roundStored.length < count) return null;
    if (roundStored.some((v) => v == null || v === '')) return null;
    return roundStored.map(String);
  }
  const s = String(roundStored);
  if (!s) return null;
  if (count <= 1) return [s];
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < count) return null;
  return parts.slice(0, count);
}

/** Loop package or single-round view of stored value. */
function getLoopPackage(stored) {
  if (stored && typeof stored === 'object' && !Array.isArray(stored) && Array.isArray(stored.data)) {
    return {
      rounds: stored.rounds || stored.data.length,
      data: stored.data,
    };
  }
  return null;
}

/**
 * All stdin lines for one site (handles loop expansion).
 * @returns {string[]|null} null if incomplete
 */
function siteToStdinLines(stored, slotCount) {
  const count = Math.max(1, slotCount | 0);
  const pack = getLoopPackage(stored);
  if (pack) {
    const lines = [];
    for (let r = 0; r < pack.rounds; r++) {
      const arr = asSlotArray(pack.data[r], count);
      if (!arr) return null;
      lines.push(count <= 1 ? arr[0] : arr.join(' '));
    }
    return lines;
  }
  const arr = asSlotArray(stored, count);
  if (!arr) return null;
  return [count <= 1 ? arr[0] : arr.join(' ')];
}

function isSiteComplete(stored, slotCount, expectedRounds = 1) {
  const pack = getLoopPackage(stored);
  if (pack) {
    if (pack.data.length < expectedRounds) return false;
    for (let r = 0; r < expectedRounds; r++) {
      if (!asSlotArray(pack.data[r], slotCount)) return false;
    }
    return true;
  }
  if (expectedRounds > 1) return false;
  return !!asSlotArray(stored, slotCount);
}

export function getInputValuesForFile(file) {
  // Flattened list used by older callers — one entry per site (joined); prefer buildStdinPayload
  const key = fileKey(file || editorManager?.activeFile);
  const map = valueStore.get(key);
  if (!map) return [];
  const sites = findInputSites(readCode());
  return sites.map((s) => {
    const lines = siteToStdinLines(map.get(s.line), s.count || 1);
    if (!lines) return null;
    return lines.join('\n');
  });
}

export function hasAllInputValues(file) {
  const key = fileKey(file || editorManager?.activeFile);
  const map = valueStore.get(key);
  const code = readCode();
  const sites = findInputSites(code);
  if (!sites.length) return true;
  if (!map) return false;
  const loops = findLoops(code);
  const maxLoop = getSettings().maxLoopInputs ?? 100;
  const env = buildInputEnv(key);
  return sites.every((s) => {
    const loop = getInnermostLoop(loops, s.line);
    const resolved = resolveLoopRounds(loop, maxLoop, env);
    const expected = resolved.rounds == null ? 1 : Math.max(1, resolved.rounds);
    const stored = map.get(s.line);
    const pack = getLoopPackage(stored);
    if (resolved.unknown && pack) {
      return isSiteComplete(stored, s.count || 1, pack.rounds);
    }
    if (resolved.unknown && !pack) return false;
    return isSiteComplete(stored, s.count || 1, expected);
  });
}

export function buildStdinPayload(file) {
  const key = fileKey(file || editorManager?.activeFile);
  const map = valueStore.get(key);
  const code = readCode();
  const sites = findInputSites(code);
  const lines = [];
  for (const s of sites) {
    const stored = map ? map.get(s.line) : null;
    const chunk = siteToStdinLines(stored, s.count || 1);
    if (chunk) lines.push(...chunk);
    else lines.push('');
  }
  return lines.join('\n') + (lines.length ? '\n' : '');
}

export function getMissingInputCount(file) {
  const key = fileKey(file || editorManager?.activeFile);
  const map = valueStore.get(key);
  const code = readCode();
  const sites = findInputSites(code);
  const loops = findLoops(code);
  const maxLoop = getSettings().maxLoopInputs ?? 100;
  const env = buildInputEnv(key);
  let missing = 0;
  for (const s of sites) {
    const loop = getInnermostLoop(loops, s.line);
    const resolved = resolveLoopRounds(loop, maxLoop, env);
    const stored = map ? map.get(s.line) : null;
    const pack = getLoopPackage(stored);
    const expected =
      resolved.rounds != null
        ? Math.max(1, resolved.rounds)
        : pack
          ? pack.rounds
          : 1;
    for (let r = 0; r < expected; r++) {
      const round = pack ? pack.data[r] : r === 0 ? stored : null;
      if (!asSlotArray(round, s.count || 1)) missing += s.count || 1;
    }
  }
  return missing;
}

export function clearInputValues(file) {
  const key = fileKey(file || editorManager?.activeFile);
  valueStore.delete(key);
}

export function resetActiveInputValues() {
  const file = editorManager?.activeFile;
  if (!file) return;
  const key = fileKey(file);
  if (valueStore.has(key) && valueStore.get(key).size) {
    valueStore.set(key, new Map());
  }
}

/** Clear stored chip values + refresh UI (idempotent). Honors clearInputOnType setting. */
export function clearChipsOnEdit() {
  const settings = getSettings();
  if (settings.clearInputOnType === false) return;
  const file = editorManager?.activeFile;
  if (!file) return;
  const key = fileKey(file);
  const map = valueStore.get(key);
  if (!map || !map.size) {
    scheduleRefresh();
    return;
  }
  valueStore.set(key, new Map());
  scheduleRefresh();
}

function scheduleClearOnEdit() {
  if (clearValuesTimer) return;
  clearValuesTimer = setTimeout(() => {
    clearValuesTimer = null;
    const code = readCode();
    if (lastCodeSnapshot && code === lastCodeSnapshot) return;
    lastCodeSnapshot = code;
    clearChipsOnEdit();
  }, 0);
}

/** How many values to show on the chip (settings, default 5, clamp 1–10). */
function getChipPreviewLimit() {
  try {
    const n = parseInt(String(getSettings().chipPreviewValues ?? 5), 10);
    if (!Number.isFinite(n)) return 5;
    return Math.max(1, Math.min(10, n));
  } catch (_) {
    return 5;
  }
}

function chipLabel(stored, count = 1, loopRounds = 1) {
  const previewLimit = getChipPreviewLimit();
  const charBudget = Math.min(48, 10 + previewLimit * 6);

  const pack = getLoopPackage(stored);
  if (pack && pack.rounds > 1) {
    const filled = pack.data.filter((r) => asSlotArray(r, count)).length;
    const parts = pack.data
      .slice(0, previewLimit)
      .map((r) => (Array.isArray(r) ? r.join(' ') : String(r ?? '')))
      .filter(Boolean);
    let preview = parts.join(' · ');
    if (pack.rounds > previewLimit) preview += ' · …';
    const short =
      preview.length > charBudget ? preview.slice(0, charBudget - 1) + '…' : preview;
    if (filled >= pack.rounds) {
      return `↻${pack.rounds}: ${short || '…'}`;
    }
    return `↻${filled}/${pack.rounds} ▸`;
  }
  const arr = asSlotArray(stored, count);
  if (arr) {
    const shown = arr.slice(0, previewLimit);
    let joined = shown.join(' ');
    if (arr.length > previewLimit) joined += ' …';
    const short =
      joined.length > charBudget ? joined.slice(0, charBudget - 1) + '…' : joined;
    return count > 1 ? `in×${count}: ${short}` : `in: ${short}`;
  }
  if (Array.isArray(stored) && stored.some((v) => v != null && v !== '')) {
    const filled = stored.filter((v) => v != null && v !== '').length;
    return `${filled}/${count} ▸`;
  }
  if (loopRounds > 1) return `↻${loopRounds} inputs ▸`;
  return count > 1 ? `${count} inputs ▸` : 'input ▸';
}

/** Prompt for one round of slot values (sequential). Returns string[] or null if cancelled at start. */
async function collectOneRound(slotDefs, prevRound, roundLabel) {
  const n = slotDefs.length;
  /** @type {string[]} */
  const values = [];
  for (let i = 0; i < n; i++) {
    values.push(prevRound && prevRound[i] != null ? String(prevRound[i]) : '');
  }
  for (let i = 0; i < n; i++) {
    const slot = slotDefs[i];
    const varLabel = slot.varName ? `&${slot.varName}` : `arg${i + 1}`;
    const typeLabel = slot.dataType || 'value';
    const step = n > 1 ? ` (${i + 1}/${n})` : '';
    const title = `${roundLabel}${varLabel} · ${typeLabel}${step}`;
    const kbType = slot.promptType === 'number' ? 'number' : 'text';
    let result;
    try {
      result = await prompt(title, values[i] || '', kbType, {
        match: null,
        required: false,
        placeholder: `${typeLabel} for ${varLabel}`,
      });
    } catch (_) {
      result = null;
    }
    if (result === null || result === undefined) {
      return i === 0 && !values.some((v) => v) ? null : values;
    }
    values[i] = String(result);
    await new Promise((r) => setTimeout(r, 100));
  }
  return values;
}

/**
 * Sequential prompts — one popup per variable.
 * If inside a loop: collect for each iteration (capped), with Same / Range / Pattern shortcuts.
 */
async function openInputPrompt(line0, kind, key, _promptType = 'text', count = 1, siteHint = null) {
  if (promptOpen) return;
  promptOpen = true;

  try {
    const code = readCode();
    const sites = findInputSites(code);
    const site =
      siteHint ||
      sites.find((s) => s.line === line0) || {
        line: line0,
        kind,
        count: count || 1,
        slots: [{ varName: 'input', spec: '?', dataType: 'value', promptType: _promptType }],
      };
    const slotDefs = site.slots || [
      { varName: 'input', spec: '?', dataType: 'value', promptType: _promptType },
    ];
    const slotCount = slotDefs.length;

    const settings = getSettings();
    const maxLoop = settings.maxLoopInputs ?? 100;
    const loops = findLoops(code);
    const loop = getInnermostLoop(loops, line0);
    const env = buildInputEnv(key);
    let resolved = resolveLoopRounds(loop, maxLoop, env);

    // Unknown loop count → ask user (capped) — unless bound var already resolved
    let rounds = resolved.rounds;
    if (resolved.unknown || rounds == null) {
      if (loop) {
        let asked;
        try {
          asked = await prompt(
            `Loop input count (max ${maxLoop})`,
            String(Math.min(5, maxLoop)),
            'number',
            {
              required: true,
              placeholder: `How many times does this input run? (≤${maxLoop})`,
            }
          );
        } catch (_) {
          asked = null;
        }
        if (asked === null || asked === undefined) {
          toast('Cancelled', 1200);
          return;
        }
        rounds = Math.max(1, Math.min(maxLoop, parseInt(String(asked), 10) || 1));
        if (parseInt(String(asked), 10) > maxLoop) {
          toast(`Capped at maxLoopInputs (${maxLoop})`, 2000);
        }
      } else {
        rounds = 1;
      }
    } else if (resolved.capped) {
      toast(`Loop ~${resolved.total}× → capped to ${rounds} (settings)`, 2200);
      await new Promise((r) => setTimeout(r, 200));
    }

    rounds = Math.max(1, rounds | 0);

    // Fill mode when multiple rounds
    let mode = 'manual';
    if (rounds > 1) {
      let choice;
      try {
        choice = await select(
          `Loop ×${rounds} — fill mode`,
          [
            ['manual', 'Enter each round (one by one)'],
            ['same', 'Same value for every round'],
            ['range', 'Numeric range (start → end, step)'],
            ['expr', 'Pattern (+2, *2, -1, …)'],
          ],
          { hideOnSelect: true }
        );
      } catch (_) {
        choice = null;
      }
      if (!choice) {
        toast('Cancelled', 1200);
        return;
      }
      mode = choice;
    }

    /** @type {string[][]} */
    const data = [];
    const map = valueStore.get(key) || new Map();
    const prev = map.get(line0);
    const prevPack = getLoopPackage(prev);

    if (mode === 'same') {
      const first = await collectOneRound(
        slotDefs,
        prevPack?.data?.[0] || (Array.isArray(prev) ? prev : null),
        rounds > 1 ? `Same×${rounds} · ` : ''
      );
      if (!first) {
        toast('Cancelled', 1200);
        return;
      }
      for (let r = 0; r < rounds; r++) data.push([...first]);
    } else if (mode === 'range' || mode === 'expr') {
      // Only for single numeric slot — multi-slot falls back to first slot pattern + empty others
      const startStr = await prompt(
        mode === 'range' ? 'Range start' : 'Pattern start value',
        '1',
        'number',
        { required: true, placeholder: 'Starting number' }
      );
      if (startStr === null || startStr === undefined) {
        toast('Cancelled', 1200);
        return;
      }
      let series = [];
      if (mode === 'range') {
        const endStr = await prompt('Range end', String(Number(startStr) + rounds - 1), 'number', {
          required: true,
          placeholder: 'End (rest filled with last if short)',
        });
        if (endStr === null || endStr === undefined) {
          toast('Cancelled', 1200);
          return;
        }
        const stepStr = await prompt('Step', '1', 'number', {
          required: true,
          placeholder: 'e.g. 1, 2, -1',
        });
        if (stepStr === null || stepStr === undefined) {
          toast('Cancelled', 1200);
          return;
        }
        series = expandPattern(
          'range',
          { start: startStr, end: endStr, step: stepStr },
          rounds
        );
      } else {
        const opStr = await prompt('Increment op', '+1', 'text', {
          required: true,
          placeholder: 'e.g. +2  |  -1  |  *2',
        });
        if (opStr === null || opStr === undefined) {
          toast('Cancelled', 1200);
          return;
        }
        series = expandPattern('expr', { start: startStr, op: opStr }, rounds);
      }
      for (let r = 0; r < rounds; r++) {
        const row = [];
        for (let s = 0; s < slotCount; s++) {
          row.push(s === 0 ? String(series[r] ?? '') : '');
        }
        data.push(row);
      }
      // if multi-slot, collect remaining slots once as "same"
      if (slotCount > 1) {
        toast('Enter remaining fields (applied to all rounds)', 1800);
        await new Promise((r) => setTimeout(r, 200));
        const rest = await collectOneRound(slotDefs, data[0], `Other fields ×${rounds} · `);
        if (rest) {
          for (let r = 0; r < rounds; r++) {
            for (let s = 1; s < slotCount; s++) data[r][s] = rest[s];
            // keep series value on slot 0
            data[r][0] = String(series[r] ?? data[r][0]);
          }
        }
      }
    } else {
      // manual: each round
      for (let r = 0; r < rounds; r++) {
        const prevRound = prevPack?.data?.[r] || null;
        const label = rounds > 1 ? `Round ${r + 1}/${rounds} · ` : '';
        const roundVals = await collectOneRound(slotDefs, prevRound, label);
        if (!roundVals) {
          if (r === 0) {
            toast('Cancelled', 1200);
            return;
          }
          toast(`Saved ${r}/${rounds} rounds`, 1500);
          break;
        }
        data.push(roundVals.map(String));
        // if user left trailing empties mid-round, still keep
      }
    }

    if (!data.length) return;

    if (!valueStore.has(key)) valueStore.set(key, new Map());
    if (rounds > 1 || data.length > 1) {
      valueStore.get(key).set(line0, { rounds: data.length, data });
    } else {
      valueStore.get(key).set(line0, data[0]);
    }
    lastCodeSnapshot = readCode();
    toast(
      data.length > 1 ? `Saved ${data.length} loop rounds` : slotCount > 1 ? `${slotCount} inputs saved` : 'Input saved',
      1400
    );

    // If this input feeds a loop bound (e.g. scanf &b → for i<=b), expand/refresh loop chips
    try {
      const varNames = (site.slots || []).map((s) => s.varName).filter(Boolean);
      const changed = refreshDependentLoopInputs(key, varNames);
      if (changed) {
        toast('Loop inputs updated from bound variable — review chip values', 2200);
      }
    } catch (_) {}

    scheduleRefresh();
  } finally {
    setTimeout(() => {
      promptOpen = false;
    }, 200);
  }
}

/**
 * When a bound variable (e.g. b) is set, resize every loop-site package that depends on it.
 * - New rounds from env
 * - If site had a single value / one round, repeat that value for all rounds
 * - If already multi-round, pad with last value or trim
 * @returns {boolean} true if any loop site changed
 */
function refreshDependentLoopInputs(key, varNames) {
  if (!varNames || !varNames.length) return false;
  const code = readCode();
  const loops = findLoops(code);
  const maxLoop = getSettings().maxLoopInputs ?? 100;
  const env = buildInputEnv(key);
  const sites = findInputSites(code);
  const map = valueStore.get(key);
  if (!map) return false;

  let changed = false;
  for (const site of sites) {
    const loop = getInnermostLoop(loops, site.line);
    if (!loop) continue;
    const bv = loop.boundVar || loop.est?.boundVar;
    if (!bv || !varNames.includes(bv)) continue;

    const resolved = resolveLoopRounds(loop, maxLoop, env);
    if (resolved.rounds == null) continue;
    const target = Math.max(1, resolved.rounds | 0);
    const slotCount = site.count || 1;
    const stored = map.get(site.line);
    const pack = getLoopPackage(stored);

    /** @type {string[][]} */
    let data = [];
    if (pack && pack.data.length) {
      data = pack.data.map((r) =>
        Array.isArray(r) ? r.map(String) : [String(r ?? '')]
      );
    } else if (Array.isArray(stored)) {
      data = [stored.map(String)];
    } else if (stored != null && stored !== '') {
      data = [[String(stored)]];
    } else {
      // empty — still create package so chip shows ↻N
      data = [];
    }

    // Normalize each row to slotCount length
    data = data.map((row) => {
      const r = row.slice(0, slotCount);
      while (r.length < slotCount) r.push('');
      return r;
    });

    if (data.length === 0) {
      // no prior value — empty rounds (user must fill); chip shows ↻N ▸
      data = Array.from({ length: target }, () => Array(slotCount).fill(''));
    } else if (data.length === 1 && target > 1) {
      // single value → repeat for all rounds
      const seed = data[0];
      data = Array.from({ length: target }, () => [...seed]);
    } else if (data.length < target) {
      const last = data[data.length - 1];
      while (data.length < target) data.push([...last]);
    } else if (data.length > target) {
      data = data.slice(0, target);
    }

    map.set(site.line, { rounds: data.length, data, fromBound: bv, needsReview: true });
    changed = true;
  }
  return changed;
}

/**
 * Attach one interaction path only: double-tap (two clicks < 300ms).
 * Do NOT also listen to dblclick — that caused double confirmation.
 */
function bindChipOpen(el, openFn) {
  let lastTap = 0;
  el.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTap < 320) {
        lastTap = 0;
        openFn(e);
      } else {
        lastTap = now;
      }
    },
    true
  );
  // Touch: same via click synthesis on most WebViews; also handle touchend double
  let lastTouch = 0;
  el.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouch < 320) {
        e.preventDefault();
        e.stopPropagation();
        lastTouch = 0;
        lastTap = 0;
        openFn(e);
      } else {
        lastTouch = now;
      }
    },
    { passive: false }
  );
}

function clearChipDom() {
  document.querySelectorAll('.acode-cpp-input-chip').forEach((el) => el.remove());
  document.querySelectorAll('[data-cpp-input-chip]').forEach((el) => el.remove());
}

function clearCm6Chips(editor) {
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

function placeChipsCm6Decorations(editor, sites, key) {
  const cmView = acode.require('@codemirror/view');
  const cmState = acode.require('@codemirror/state');
  if (!cmView?.Decoration || !cmView?.WidgetType || !cmState?.Compartment || !cmView?.EditorView) {
    return false;
  }
  if (!compartment) compartment = new cmState.Compartment();

  const map = valueStore.get(key) || new Map();

  class ChipWidget extends cmView.WidgetType {
    constructor(site, value) {
      super();
      this.site = site;
      this.value = value;
    }
    eq(other) {
      return (
        other instanceof ChipWidget &&
        other.site?.line === this.site?.line &&
        other.site?.count === this.site?.count &&
        JSON.stringify(other.value) === JSON.stringify(this.value)
      );
    }
    toDOM() {
      const count = this.site.count || 1;
      const loopRounds = this.site.loopRounds || 1;
      const pack = getLoopPackage(this.value);
      const complete = pack
        ? isSiteComplete(this.value, count, pack.rounds)
        : isSiteComplete(this.value, count, loopRounds > 1 ? loopRounds : 1);
      const el = document.createElement('span');
      el.className =
        'cm-cpp-input-chip' +
        (complete ? ' filled' : ' empty') +
        (loopRounds > 1 || (pack && pack.rounds > 1) ? ' is-loop' : '');
      el.setAttribute('data-cpp-input-chip', '1');
      el.textContent = chipLabel(this.value, count, loopRounds);
      const names = (this.site.slots || []).map((s) => s.varName).filter(Boolean);
      const nameHint = names.length ? names.map((n) => '&' + n).join(', ') : this.site.kind;
      const loopHint =
        loopRounds > 1
          ? `\nInside loop ×${loopRounds}${this.site.loopDetail ? ` (${this.site.loopDetail})` : ''}`
          : '';
      el.title = complete
        ? `${nameHint}${loopHint}\nDouble-tap to re-enter`
        : `${nameHint}${loopHint}\nDouble-tap — fill values`;
      el.contentEditable = 'false';

      bindChipOpen(el, () => {
        openInputPrompt(
          this.site.line,
          this.site.kind,
          key,
          this.site.promptType,
          count,
          this.site
        );
      });
      return el;
    }
    ignoreEvent() {
      return false;
    }
  }

  const ranges = [];
  const doc = editor.state.doc;
  for (const site of sites) {
    try {
      const lineNo = Math.min(site.line + 1, doc.lines);
      const line = doc.line(lineNo);
      const val = map.get(site.line);
      const widget = new ChipWidget(site, val);
      ranges.push(
        cmView.Decoration.widget({ widget, side: 1, block: false }).range(line.to)
      );
    } catch (_) {}
  }
  if (!ranges.length) {
    clearCm6Chips(editor);
    return true;
  }
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
    return true;
  } catch (e) {
    console.warn('[InputChips] decoration failed', e);
    return false;
  }
}

function placeChipsFixed(editor, sites, key) {
  clearChipDom();
  const map = valueStore.get(key) || new Map();
  const header = document.querySelector('#root > header.tile');
  const minTop = header ? header.getBoundingClientRect().bottom + 2 : 48;
  const isCM6 = typeof editor.dispatch === 'function';

  if (isCM6 && editor.coordsAtPos && editor.state?.doc) {
    const doc = editor.state.doc;
    for (const site of sites) {
      try {
        const line = doc.line(site.line + 1);
        const coords = editor.coordsAtPos(line.to);
        if (!coords) continue;
        if (coords.top < minTop || coords.top > window.innerHeight - 20) continue;
        appendFixedChip(site, map, key, coords.right + 8, coords.top, minTop);
      } catch (_) {}
    }
    return;
  }

  if (editor.renderer) {
    const renderer = editor.renderer;
    const first = renderer.getFirstVisibleRow();
    const last = renderer.getLastVisibleRow();
    for (const site of sites) {
      if (site.line < first || site.line > last) continue;
      try {
        const lineContent = editor.session.getLine(site.line) || '';
        const coords = renderer.textToScreenCoordinates(site.line, lineContent.length);
        if (!coords || coords.pageY < minTop) continue;
        appendFixedChip(site, map, key, coords.pageX + 10, coords.pageY, minTop);
      } catch (_) {}
    }
  }
}

function appendFixedChip(site, map, key, left, top, minTop) {
  const val = map.get(site.line);
  const count = site.count || 1;
  const loopRounds = site.loopRounds || 1;
  const pack = getLoopPackage(val);
  const complete = pack
    ? isSiteComplete(val, count, pack.rounds)
    : isSiteComplete(val, count, loopRounds > 1 ? loopRounds : 1);
  const el = document.createElement('span');
  el.className =
    'acode-cpp-input-chip' +
    (complete ? ' filled' : ' empty') +
    (loopRounds > 1 || (pack && pack.rounds > 1) ? ' is-loop' : '');
  el.textContent = chipLabel(val, count, loopRounds);
  const names = (site.slots || []).map((s) => s.varName).filter(Boolean);
  const nameHint = names.length ? names.map((n) => '&' + n).join(', ') : site.kind;
  el.title = complete ? `${nameHint}` : `${nameHint} · fill`;
  el.style.cssText = `
    position: fixed;
    left: ${left}px;
    top: ${Math.max(top, minTop)}px;
    z-index: 5;
    pointer-events: auto;
    user-select: none;
    font-size: 10px;
    line-height: 1.2;
    padding: 1px 6px;
    border-radius: 10px;
    font-family: system-ui, sans-serif;
    white-space: nowrap;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    border: 1px solid ${complete ? 'rgba(76,175,80,0.55)' : 'rgba(255,193,7,0.5)'};
    background: ${complete ? 'rgba(46,125,50,0.85)' : 'rgba(80,60,10,0.82)'};
    color: ${complete ? '#e8f5e9' : '#fff8e1'};
  `;
  bindChipOpen(el, () => {
    openInputPrompt(site.line, site.kind, key, site.promptType || 'text', count, site);
  });
  document.body.appendChild(el);
}

export function refreshInputChips() {
  const settings = getSettings();
  const file = editorManager?.activeFile;
  const editor = editorManager?.editor;

  if (settings.enableInputChips === false || settings.pluginEnabled === false) {
    clearChipDom();
    if (editor) clearCm6Chips(editor);
    return;
  }
  if (!file || !/\.(c|cpp|cxx|cc)$/i.test(file.filename || '')) {
    clearChipDom();
    if (editor) clearCm6Chips(editor);
    return;
  }
  if (!editor) return;

  const code = readCode();
  const sites = findInputSites(code);
  const key = fileKey(file);

  const isCM6 = typeof editor.dispatch === 'function' && editor.state?.doc;
  if (isCM6) {
    clearChipDom();
    const ok = placeChipsCm6Decorations(editor, sites, key);
    if (ok) return;
  }
  placeChipsFixed(editor, sites, key);
}

export function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshInputChips(), 80);
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

function onDocChange() {
  scheduleClearOnEdit();
}

function attachCm6ChipClearListener(editor) {
  if (!editor || typeof editor.dispatch !== 'function' || !editor.state?.doc) return;
  try {
    const cmView = acode.require('@codemirror/view');
    const cmState = acode.require('@codemirror/state');
    if (!cmView?.EditorView?.updateListener || !cmState?.Compartment) return;
    if (!chipUpdateCompartment) chipUpdateCompartment = new cmState.Compartment();
    const listener = cmView.EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChange();
    });
    const existing = chipUpdateCompartment.get(editor.state);
    if (existing === undefined) {
      editor.dispatch({
        effects: cmState.StateEffect.appendConfig.of(chipUpdateCompartment.of(listener)),
      });
    } else {
      editor.dispatch({ effects: chipUpdateCompartment.reconfigure(listener) });
    }
  } catch (_) {}
}

export function initInputChips() {
  lastCodeSnapshot = readCode();

  editorManager.on('switch-file', () => {
    lastCodeSnapshot = readCode();
    scheduleRefresh();
    try {
      attachCm6ChipClearListener(editorManager?.editor);
    } catch (_) {}
  });
  editorManager.on('rename-file', () => scheduleRefresh());
  editorManager.on('file-loaded', () => {
    lastCodeSnapshot = readCode();
    scheduleRefresh();
    try {
      attachCm6ChipClearListener(editorManager?.editor);
    } catch (_) {}
  });

  if (!changeClearAttached) {
    changeClearAttached = true;

    const docHandler = (e) => {
      if (isEditorTypingTarget(e.target)) onDocChange();
    };

    document.addEventListener('beforeinput', docHandler, true);
    document.addEventListener('input', docHandler, true);
    document.addEventListener(
      'keydown',
      (e) => {
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
          if (isEditorTypingTarget(e.target)) onDocChange();
        }
      },
      true
    );
    document.addEventListener('paste', docHandler, true);

    try {
      const editor = editorManager?.editor;
      if (editor?.session?.on) {
        editor.session.on('change', onDocChange);
        editor.session.on('changeScrollTop', () => scheduleRefresh());
      }
      if (typeof editor?.on === 'function') {
        editor.on('change', onDocChange);
      }
      attachCm6ChipClearListener(editor);
    } catch (_) {}

    window.addEventListener('scroll', () => scheduleRefresh(), true);
  }

  scheduleRefresh();
}

export function destroyInputChips() {
  clearTimeout(refreshTimer);
  clearChipDom();
  const editor = editorManager?.editor;
  if (editor) clearCm6Chips(editor);
  promptOpen = false;
}
