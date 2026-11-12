// src/runner.js — Compile & run: terminal | popup | inline (beta)
// Supports input chips (stdin), buffer-fix injection, inline logs.

const toast = acode.require('toast');
const select = acode.require('select');

import { getSharedTerminal, writeToTerminal, runCommand, executeCommand } from './terminalManager.js';
import { ensureCDeps } from './dependencyChecker.js';
import { prepareProject, toBase64, shellEscape } from './virtualWorkspace.js';
import { getSettings } from './settings.js';
import { applyBufferFix } from './bufferFix.js';
import {
  hasAllInputValues,
  getMissingInputCount,
  buildStdinPayload,
  findInputSites,
} from './inputChips.js';
import { showInlineRunOutput, clearInlineRunOutput, isErrorOutput } from './inlineRunOutput.js';

/**
 * Build shell script: write sources → compile → run (optional stdin file).
 */
function createRunScript(project, displayPath, {
  clearScreen = true,
  stdinB64 = null,
  mode = 'terminal', // terminal | popup | inline
} = {}) {
  const { mainFileName, isCpp, fileContents, projectDir } = project;
  const outputName = mainFileName.replace(/\.[^/.]+$/, '') || 'a.out';
  const outputExe = `./${outputName}`;
  const compiler = isCpp ? 'g++' : 'gcc';

  const settings = getSettings();
  const std = isCpp
    ? settings.cppStandard || 'gnu++17'
    : settings.cStandard || 'gnu11';
  const extraFlags = (settings.compilerFlags || '-Wall -Wextra -O2').trim();

  // Inline: never print meta banners (only program stdout)
  const isInline = mode === 'inline';
  const isPopup = mode === 'popup';
  const isTerm = mode === 'terminal' || (!isInline && !isPopup);

  const show = (keyTerm, keyPopup) => {
    if (isInline) return false;
    if (isPopup) return settings[keyPopup] !== false;
    return settings[keyTerm] !== false;
  };

  const showCompile = show('termShowCompileInfo', 'popupShowCompileInfo');
  const showFile = show('termShowFilePath', 'popupShowFilePath');
  const showCmd = show('termShowCommand', 'popupShowCommand');
  const showRunBanner = show('termShowRunBanner', 'popupShowRunBanner');
  const showTiming = show('termShowTiming', 'popupShowTiming');
  const showExit = show('termShowExitCode', 'popupShowExitCode');

  let script = '#!/bin/sh\n';
  if (clearScreen && isTerm) script += "printf '\\033[2J\\033[H' 2>/dev/null || true\n";

  script += `WORKDIR='${shellEscape(projectDir)}'\n`;
  script += 'mkdir -p "$WORKDIR" || exit 1\n';
  script += 'cd "$WORKDIR" || exit 1\n';
  script += 'rm -f .runner_bin 2>/dev/null || true\n';

  for (const [name, content] of Object.entries(fileContents || {})) {
    const b64 = toBase64(content ?? '');
    script += `echo '${b64}' | base64 -d > '${shellEscape(name)}'\n`;
  }

  if (stdinB64) {
    script += `echo '${stdinB64}' | base64 -d > .stdin_payload\n`;
  }

  script += 'START_TIME=$(date +%s.%N 2>/dev/null || date +%s)\n';
  if (showCompile) {
    script += `echo -e "\\n\\033[1;34m[compile]\\033[0m ${compiler} -std=${std} ${extraFlags}"\n`;
  }
  if (showFile) {
    script += `echo -e "\\033[1;36m[file]\\033[0m ${displayPath.replace(/'/g, '')}"\n`;
  }
  if (showCompile || showFile) script += 'echo\n';

  script += 'EXTRA=""\n';
  if (isCpp) {
    script += 'for f in *.cpp *.cc *.cxx; do\n';
  } else {
    script += 'for f in *.c; do\n';
  }
  script += '  [ -f "$f" ] || continue\n';
  script += `  [ "$f" = "${shellEscape(mainFileName)}" ] && continue\n`;
  script += '  if ! grep -a -qE "(int|void)[[:space:]]+main[[:space:]]*\\(" "$f" 2>/dev/null; then\n';
  script += '    EXTRA="$EXTRA $f"\n';
  script += '  fi\n';
  script += 'done\n';

  if (showCmd) {
    script += `echo "[cmd] ${compiler} -std=${std} ${extraFlags} -I. ${shellEscape(mainFileName)} $EXTRA -o ${shellEscape(outputExe)} -lm"\n`;
  }
  script += `${compiler} -std=${std} ${extraFlags} -I. '${shellEscape(mainFileName)}' $EXTRA -o '${shellEscape(outputExe)}' -lm\n`;
  script += 'COMPILE_CODE=$?\n';
  script += 'if [ "$COMPILE_CODE" -ne 0 ]; then\n';
  script += '  echo -e "\\n\\033[1;31m[compile failed]\\033[0m exit=$COMPILE_CODE"\n';
  script += '  echo CPP_RUN_END\n';
  script += '  exit $COMPILE_CODE\n';
  script += 'fi\n';
  script += `chmod +x '${shellEscape(outputExe)}' 2>/dev/null || true\n`;
  if (showRunBanner) {
    script += 'echo -e "\\033[1;32m[run]\\033[0m"\n';
    script += 'echo\n';
  }
  if (stdinB64) {
    script += `'${shellEscape(outputExe)}' < .stdin_payload\n`;
  } else {
    script += `'${shellEscape(outputExe)}'\n`;
  }
  script += 'EXIT_CODE=$?\n';
  script += 'END_TIME=$(date +%s.%N 2>/dev/null || date +%s)\n';
  script += 'if command -v awk >/dev/null 2>&1; then\n';
  script += '  EXEC_TIME=$(awk "BEGIN {printf \\"%.3f\\", $END_TIME - $START_TIME}" 2>/dev/null || echo "?")\n';
  script += 'else\n';
  script += '  EXEC_TIME="?"\n';
  script += 'fi\n';
  if (showTiming || showExit) {
    script += 'echo\n';
    if (showExit && showTiming) {
      script += 'echo -e "\\033[1;30m[Process exited with code $EXIT_CODE in ${EXEC_TIME}s]\\033[0m"\n';
    } else if (showExit) {
      script += 'echo -e "\\033[1;30m[Process exited with code $EXIT_CODE]\\033[0m"\n';
    } else if (showTiming) {
      script += 'echo -e "\\033[1;30m[Time ${EXEC_TIME}s]\\033[0m"\n';
    }
  }
  script += 'echo CPP_RUN_END\n';
  script += 'exit $EXIT_CODE\n';

  return script;
}

function readEditorText(file) {
  const editor = window.editorManager?.editor;
  const isCM6 = editor && typeof editor.dispatch === 'function';
  if (isCM6 && editor.state) return editor.state.doc.toString();
  if (file?.session?.getValue) return file.session.getValue();
  return '';
}

/**
 * Apply buffer-fix + return modified project fileContents (clone).
 */
function maybeApplyBufferFix(project, originalCode) {
  const settings = getSettings();
  if (!settings.autoBufferFix) return project;

  const main = project.mainFileName;
  const isCpp = !!project.isCpp;
  const fixed = applyBufferFix(project.fileContents[main] ?? originalCode, isCpp);
  return {
    ...project,
    fileContents: {
      ...project.fileContents,
      [main]: fixed,
    },
  };
}

async function pickRunMode() {
  const choice = await select(
    'Run mode',
    [
      ['terminal', 'Run in terminal'],
      ['popup', 'Run in popup'],
      ['inline', 'Run inline editor (beta)'],
    ],
    { hideOnSelect: true }
  );
  return choice || null;
}

/** Bottom toast-style run output (not an Acode Page). */
let bottomPopupEl = null;
let bottomPopupTimer = null;
let bottomPopupTouched = false;
let bottomPopupOutsideHandler = null;

function hideBottomPopup(animate = true) {
  if (bottomPopupTimer) {
    clearTimeout(bottomPopupTimer);
    bottomPopupTimer = null;
  }
  if (bottomPopupOutsideHandler) {
    try {
      document.removeEventListener('pointerdown', bottomPopupOutsideHandler, true);
      document.removeEventListener('touchstart', bottomPopupOutsideHandler, true);
      document.removeEventListener('mousedown', bottomPopupOutsideHandler, true);
    } catch (_) {}
    bottomPopupOutsideHandler = null;
  }
  const el = bottomPopupEl;
  if (!el) return;
  bottomPopupEl = null;
  bottomPopupTouched = false;

  if (!animate) {
    try {
      el.remove();
    } catch (_) {}
    return;
  }
  el.classList.remove('is-visible');
  el.classList.add('is-hiding');
  const done = () => {
    try {
      el.remove();
    } catch (_) {}
  };
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 320);
}

/**
 * Light syntax coloring for compiler diagnostics in the bottom popup.
 * Keeps ANSI stripped; highlights error/warning/note + file:line:col.
 */
function fillPopupFormatted(el, text, isError) {
  const raw = String(text || '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/CPP_RUN_END/g, '')
    .trim();
  if (!raw) {
    el.textContent = '(empty output)';
    return;
  }
  if (!isError) {
    el.textContent = raw;
    return;
  }
  el.classList.add('is-error');
  el.textContent = '';
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const row = document.createElement('div');
    row.className = 'cpp-run-popup-line';

    // file:line:col: error: message
    const diag = line.match(/^(.+?:)(\d+)(:\d+:)\s*((?:fatal )?error|warning|note|info):(.*)$/i);
    if (diag) {
      const file = document.createElement('span');
      file.className = 'cpp-run-pop-file';
      file.textContent = diag[1];
      const ln = document.createElement('span');
      ln.className = 'cpp-run-pop-line-no';
      ln.textContent = diag[2];
      const col = document.createElement('span');
      col.className = 'cpp-run-pop-col';
      col.textContent = diag[3];
      const kind = document.createElement('span');
      const k = diag[4].toLowerCase();
      kind.className =
        'cpp-run-pop-kind ' +
        (k.includes('error') ? 'is-err' : k.includes('warning') ? 'is-warn' : 'is-note');
      kind.textContent = ' ' + diag[4] + ':';
      const msg = document.createElement('span');
      msg.className = 'cpp-run-pop-msg';
      msg.textContent = diag[5];
      row.append(file, ln, col, kind, msg);
    } else if (/^\s*\^/.test(line) || /^\s*\|/.test(line) || /^\s*~/.test(line)) {
      // caret / source underline from gcc
      row.className += ' cpp-run-pop-caret';
      row.textContent = line;
    } else if (/\[compile failed\]/i.test(line)) {
      row.className += ' cpp-run-pop-fail';
      row.textContent = line;
    } else {
      row.textContent = line;
    }
    el.appendChild(row);
  }
}

function showPopupOutput(_title, text, opts = {}) {
  try {
    hideBottomPopup(false);

    const isError = !!opts.isError || isErrorOutput(text);
    const el = document.createElement('div');
    el.className = 'cpp-run-bottom-popup' + (isError ? ' is-error' : '');
    el.setAttribute('role', isError ? 'alert' : 'status');
    if (isError) {
      el.style.maxHeight = 'min(42vh, 280px)';
    }
    fillPopupFormatted(el, text, isError);
    document.body.appendChild(el);
    bottomPopupEl = el;
    bottomPopupTouched = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('is-visible');
      });
    });

    const markTouched = () => {
      bottomPopupTouched = true;
      if (bottomPopupTimer) {
        clearTimeout(bottomPopupTimer);
        bottomPopupTimer = null;
      }
    };
    el.addEventListener('pointerdown', markTouched, true);
    el.addEventListener('touchstart', markTouched, { capture: true, passive: true });
    el.addEventListener('mousedown', markTouched, true);
    el.addEventListener('wheel', markTouched, { passive: true });
    el.addEventListener('scroll', markTouched, { passive: true });

    bottomPopupOutsideHandler = (e) => {
      if (!bottomPopupEl) return;
      if (e.target === bottomPopupEl || bottomPopupEl.contains(e.target)) return;
      hideBottomPopup(true);
    };
    setTimeout(() => {
      if (!bottomPopupEl) return;
      document.addEventListener('pointerdown', bottomPopupOutsideHandler, true);
      document.addEventListener('touchstart', bottomPopupOutsideHandler, true);
      document.addEventListener('mousedown', bottomPopupOutsideHandler, true);
    }, 80);

    // Errors: longer default visibility (12s); normal: 5s. Touch still cancels auto-hide.
    const hideMs = isError ? 12000 : 5000;
    bottomPopupTimer = setTimeout(() => {
      bottomPopupTimer = null;
      if (!bottomPopupTouched) hideBottomPopup(true);
    }, hideMs);
  } catch (e) {
    console.error('[Runner] popup failed', e);
    toast(String(text).slice(0, 180));
  }
}

/**
 * Non-interactive compile+run via Executor; returns combined stdout string.
 * Uses Python-Tools pattern: echo b64 | base64 -d | sh
 * (executeCommand wraps with sh -c so pipelines work under Alpine proot).
 */
async function runViaExecutor(project, displayPath, stdinB64, mode = 'popup') {
  const runScript = createRunScript(project, displayPath, {
    clearScreen: false,
    stdinB64,
    mode,
  });
  const outPath = `/tmp/acode_cpp_out_${Date.now()}.txt`;
  // Subshell so inner exit cannot skip cat; always dump outfile to Executor stdout
  const inner = runScript.replace(/^#!\/bin\/sh\n/, '');
  const wrappedBody = [
    '#!/bin/sh',
    `OUTFILE='${outPath}'`,
    '(',
    inner,
    ') >"$OUTFILE" 2>&1 || true',
    'cat "$OUTFILE" 2>/dev/null || true',
    'exit 0',
    '',
  ].join('\n');

  const scriptB64 = toBase64(wrappedBody);
  // One-shot decode | sh  (executeCommand adds outer sh -c)
  const cmd = `echo '${scriptB64}' | base64 -d | sh`;
  let out = await executeCommand(cmd, true);
  out = String(out || '');

  if (!out.trim()) {
    const again = await executeCommand(
      `cat '${outPath}' 2>/dev/null || echo '(empty — compile/run produced no captured output)'`,
      true
    );
    out = String(again || '').trim()
      ? String(again)
      : '(empty output from Executor)';
  }
  return out;
}

/**
 * Guard: if input chips enabled and required values missing → block non-terminal run.
 * Terminal mode still allows interactive typing.
 */
function checkInputsOrBlock(file, mode) {
  const settings = getSettings();
  if (settings.enableInputChips === false) return true;
  if (mode === 'terminal') return true; // user can type in terminal
  if (settings.blockRunWithoutInputs === false) return true;

  const code = readEditorText(file);
  const sites = findInputSites(code);
  if (!sites.length) return true;

  if (!hasAllInputValues(file)) {
    const n = getMissingInputCount(file);
    toast(
      `${n} input value(s) missing — set chips (double-tap) or use Terminal mode`,
      3500
    );
    return false;
  }
  return true;
}

export async function compileAndRun(file, opts = {}) {
  console.log('[Runner] compileAndRun:', file?.filename || file?.uri, opts);

  const depsOk = await ensureCDeps({
    force: false,
    focus: /\.(cpp|cxx|cc|c\+\+)$/i.test(file?.filename || '') ? 'cpp' : 'c',
  });
  if (!depsOk) {
    const again = await ensureCDeps({
      force: true,
      focus: /\.(cpp|cxx|cc|c\+\+)$/i.test(file?.filename || '') ? 'cpp' : 'c',
      reason: 'Run needs gcc/g++. Install the C/C++ toolchain now?',
    });
    if (!again) {
      toast('Compiler not available');
      return;
    }
  }

  if (!file?.filename && !file?.uri) {
    toast('No valid file open.');
    return;
  }

  const settings = getSettings();
  let mode = opts.mode || settings.runMode || 'ask';
  if (mode === 'ask') {
    mode = await pickRunMode();
    if (!mode) return;
  }

  if (!checkInputsOrBlock(file, mode)) {
    return;
  }

  toast('Preparing…', 1200);

  let project;
  let originalCode = '';
  try {
    originalCode = readEditorText(file);
    const fileObj =
      file.uri
        ? file
        : { ...file, uri: file.filename || 'untitled.cpp', filename: file.filename || 'untitled.cpp' };

    project = await prepareProject(fileObj, originalCode, false);
  } catch (err) {
    console.error('[Runner] prepare failed:', err);
    toast('Prepare failed (check console)');
    return;
  }

  if (!project?.projectDir || !project.fileContents) {
    toast('Failed to prepare project');
    return;
  }

  if (!Object.keys(project.fileContents).length) {
    toast('No source content to compile');
    return;
  }

  // Buffer fix on the copy that will be compiled
  project = maybeApplyBufferFix(project, originalCode);

  let displayPath = file.uri || file.filename || project.mainFileName;
  if (displayPath.includes('::')) displayPath = displayPath.split('::').pop();

  // Stdin from input chips (all modes can benefit; terminal can still type extra)
  let stdinB64 = null;
  if (settings.enableInputChips !== false) {
    const payload = buildStdinPayload(file);
    if (payload && payload.trim()) {
      stdinB64 = toBase64(payload);
    }
  }

  // ── Terminal ──
  if (mode === 'terminal') {
    const runScript = createRunScript(project, displayPath, {
      clearScreen: settings.runInClearScreen !== false,
      stdinB64: null, // interactive terminal: let user type
      mode: 'terminal',
    });
    // If chips filled and user wants them even in terminal:
    const useChipStdinInTerm = settings.feedChipsInTerminal === true && stdinB64;
    const finalScript = useChipStdinInTerm
      ? createRunScript(project, displayPath, {
          clearScreen: settings.runInClearScreen !== false,
          stdinB64,
          mode: 'terminal',
        })
      : runScript;

    const runnerPath = `/tmp/acode_cpp_run_${Date.now()}.sh`;
    const scriptB64 = toBase64(finalScript);
    const terminalCmd =
      `echo '${scriptB64}' | base64 -d > '${shellEscape(runnerPath)}' ` +
      `&& chmod +x '${shellEscape(runnerPath)}' ` +
      `&& sh '${shellEscape(runnerPath)}'`;

    try {
      const term = await getSharedTerminal('C/C++ Terminal');
      if (!term?.id) {
        toast('Could not open terminal');
        return;
      }
      try {
        term.file?.makeActive?.();
      } catch (_) {}
      toast('Compiling & running…', 1500);
      await new Promise((r) => setTimeout(r, 350));
      const ok = writeToTerminal(term.id, terminalCmd);
      if (!ok) await runCommand(terminalCmd);
    } catch (err) {
      console.error('[Runner] terminal error:', err);
      toast('Run failed – check console');
    }
    return;
  }

  // ── Popup / Inline (Executor, non-interactive) ──
  toast('Compiling & running…', 1500);
  try {
    clearInlineRunOutput();
    const out = await runViaExecutor(project, displayPath, stdinB64, mode);

    if (mode === 'popup') {
      showPopupOutput('C/C++ · ' + (file.filename || 'output'), out);
    } else if (mode === 'inline') {
      // Errors (compile / diagnostics) → formatted bottom popup, not broken inline chips
      if (isErrorOutput(out)) {
        showPopupOutput('C/C++ error', out, { isError: true });
        toast('Compile/runtime error', 1500);
      } else {
        showInlineRunOutput(originalCode, out);
        if (!String(out).trim()) toast('No output', 1200);
        else toast('Inline output shown (beta)', 1500);
      }
    } else {
      showPopupOutput('C/C++ Output', out);
    }
  } catch (err) {
    console.error('[Runner] executor run failed:', err);
    toast('Run failed – check console');
  }
}

export function cleanupRunner() {
  clearInlineRunOutput();
}
