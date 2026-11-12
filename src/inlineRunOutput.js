/**
 * inlineRunOutput.js — Ephemeral inline run logs (ninja-style).
 * CM6: Decoration.widget so logs scroll with the line (no fixed DOM / z-index issues).
 * Clears on edit and on file switch.
 */

import { getSettings } from './settings.js';
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
    const pct = lit.search(/%[0-9#0 +\-]*\.?[0-9]*[diuoxXfFeEgGaAcspn%]/);
    let body = pct >= 0 ? lit.slice(0, pct) : lit;
    const leadingNL = (body.match(/^\n+/) || [''])[0].length;
    const trailingNL = (body.match(/\n+$/) || [''])[0].length;
    body = body.replace(/^\n+/, '').replace(/\n+$/, '');
    const internalNL = (body.match(/\n/g) || []).length;
    // needle: no leading/trailing newlines (stdout may have already consumed them as line breaks)
    const needle = body;
    const score = needle.replace(/\n/g, '').trim().length;
    if (score >= 1 || leadingNL > 0) {
      literals.push({ needle, leadingNL, trailingNL, internalNL, score });
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

function mapOutputToPrintLines(code, output) {
  const codeLines = String(code || '').split('\n');
  /** @type {{ idx: number, lit: ReturnType<typeof extractPrintLiteral> }[]} */
  const printSites = [];
  for (let i = 0; i < codeLines.length; i++) {
    if (
      /\b(printf|puts|putchar|cout|cerr|clog|wprintf)\b/.test(codeLines[i]) ||
      /<<\s*["']/.test(codeLines[i])
    ) {
      printSites.push({ idx: i, lit: extractPrintLiteral(codeLines[i]) });
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
    // pure-newline printf: needle may be empty — match nothing in stream, only markers
    if (!needle.replace(/\n/g, '').trim()) {
      if (info.leadingNL || info.trailingNL) {
        if (!map.has(site.idx)) map.set(site.idx, []);
        map.get(site.idx).push(applyNewlineMarkers('', info));
        used.add(site.idx);
      }
      continue;
    }

    // Search for needle with optional surrounding whitespace; prefer exact
    const searchNeedle = needle.replace(/\n/g, ''); // match without embedded NL
    // Try full needle first (may contain internal \\n as real newlines in stream)
    let pos = stream.indexOf(needle);
    if (pos === -1 && searchNeedle !== needle) pos = stream.indexOf(searchNeedle);
    if (pos === -1) continue;

    const matchLen = pos === stream.indexOf(needle) ? needle.length : searchNeedle.length;
    let start = pos;
    // Consume one leading \\n in stream if format had leadingNL (shows as ↵, not new site)
    if (info.leadingNL > 0 && start > 0 && stream[start - 1] === '\n') {
      start -= 1;
    }

    const after = pos + matchLen;
    let end = stream.length;
    let nextLitPos = -1;
    for (const other of printSites) {
      if (other.idx === site.idx || !other.lit || used.has(other.idx)) continue;
      const on = other.lit.needle.replace(/\n/g, '');
      if (!on.trim()) continue;
      let p = stream.indexOf(other.lit.needle, after);
      if (p === -1) p = stream.indexOf(on, after);
      if (p !== -1 && (nextLitPos === -1 || p < nextLitPos)) nextLitPos = p;
    }
    if (nextLitPos !== -1) {
      end = nextLitPos;
      // don't eat the next site's leading newline
      if (end > after && stream[end - 1] === '\n') end -= 1;
    } else {
      const nl = stream.indexOf('\n', after);
      // If this printf has trailingNL, include that newline in our fragment
      if (info.trailingNL > 0 && nl !== -1) {
        end = nl + 1;
      } else if (nl !== -1) {
        end = nl;
      }
    }

    let fragment = stream.slice(start, end);
    // strip one leading/trailing newline from raw fragment — markers come from format
    fragment = fragment.replace(/^\n/, '').replace(/\n$/, '');
    const display = applyNewlineMarkers(fragment, info);
    if (display.trim() || info.leadingNL || info.trailingNL) {
      if (!map.has(site.idx)) map.set(site.idx, []);
      map.get(site.idx).push(display || '↵');
    }
    stream = stream.slice(0, start) + stream.slice(end);
    used.add(site.idx);
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

      const ranges = [];
      const doc = editor.state.doc;
      logMap.forEach((texts, lineIdx) => {
        try {
          const lineNo = Math.min(lineIdx + 1, doc.lines);
          const line = doc.line(lineNo);
          const label = formatLogLabel(texts);
          if (!label) return;
          const widget = new GhostWidget(label);
          ranges.push(
            cmView.Decoration.widget({ widget, side: 1, block: false }).range(line.to)
          );
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
