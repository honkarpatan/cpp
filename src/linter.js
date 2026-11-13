// src/linter.js
const Url = acode.require('Url');

import { executeCommand } from './terminalManager.js';
import { prepareProject, toBase64, shellEscape } from './virtualWorkspace.js';
import { ensureCDeps } from './dependencyChecker.js';
import { getSettings } from './settings.js';
import { updateLogMap, clearAllLogs } from './inlineDisplay.js';
import { detectLibraries, buildFlagsGroup, missingHeaderHint } from './libraries/catalog.js';
import { setFileProblems, clearFileProblems } from './problemsStore.js';

let lintInProgress = false;
let lintPending = null; // { session, file } requested while a lint was running
let currentErrorMarkers = [];

/**
 * One Executor call: write files to /tmp + gcc.
 * Same proot session → no cross-session FS isolation.
 */
async function lintInOneShot(projectDir, fileContents, mainFileName, isCpp) {
  const compiler = isCpp ? 'g++' : 'gcc';
  const stdFlag = isCpp ? '-std=gnu++17' : '-std=gnu11';

  const parts = [];
  parts.push(`mkdir -p '${shellEscape(projectDir)}'`);
  parts.push(`cd '${shellEscape(projectDir)}'`);

  for (const [name, content] of Object.entries(fileContents)) {
    const b64 = toBase64(content);
    parts.push(`echo '${b64}' | base64 -d > '${shellEscape(name)}'`);
  }

  // headers of installed libraries (e.g. -I/usr/include/SDL2) found via #includes
  const detected = detectLibraries(Object.values(fileContents), { localFiles: Object.keys(fileContents) });
  if (detected.length) parts.push(buildFlagsGroup(detected));

  parts.push(
    `${compiler} ${stdFlag} -fsyntax-only -Wall -Wextra ${detected.length ? '$LIB_CFLAGS ' : ''}'${shellEscape(mainFileName)}' 2>&1 || true`
  );

  const snippet = parts.join(' && ');
  const wrapped = `sh -c '${shellEscape(snippet)}'`;
  console.log('[Linter Debug] One-shot length:', wrapped.length);
  return executeCommand(wrapped, true);
}

export function clearLinterState(session) {
  if (window.minimap && typeof window.minimap.highlightLines === 'function') {
    window.minimap.highlightLines([]);
  }

  const editor = editorManager.editor;
  const isCM6 = editor && typeof editor.dispatch === 'function';

  if (isCM6) {
    try {
      const cmLint = acode.require('@codemirror/lint');
      if (cmLint?.setDiagnostics) {
        editor.dispatch(cmLint.setDiagnostics(editor.state, []));
      }
    } catch (_) {}
  } else if (session) {
    if (typeof session.clearAnnotations === 'function') session.clearAnnotations();
    if (currentErrorMarkers.length > 0) {
      currentErrorMarkers.forEach(id => {
        try { session.removeMarker(id); } catch (_) {}
      });
      currentErrorMarkers = [];
    }
  }
}

function parseCompilerErrors(errorOutput, tempFileName) {
  const annotations = [];
  if (!errorOutput || typeof errorOutput !== 'string') return annotations;

  const regex = /^(.+?):(\d+):(\d+):\s*(error|warning|fatal error):\s*(.*)$/gm;
  let match;

  while ((match = regex.exec(errorOutput)) !== null) {
    const matchedFile = match[1].trim();
    const base = matchedFile.split('/').pop();
    if (base === tempFileName || matchedFile.endsWith(tempFileName)) {
      annotations.push({
        row: parseInt(match[2], 10) - 1,
        column: Math.max(0, parseInt(match[3], 10) - 1),
        type: match[4] === 'warning' ? 'warning' : 'error',
        text: match[5] + missingHeaderHint(match[5])
      });
    }
  }
  return annotations;
}

function getCM6Diagnostics(annotations, editor) {
  const diagnostics = [];
  const doc = editor.state.doc;
  annotations.forEach(ann => {
    const lineNum = ann.row + 1;
    if (lineNum > 0 && lineNum <= doc.lines) {
      const lineObj = doc.line(lineNum);
      let fromPos = lineObj.from + ann.column;
      let toPos = lineObj.to;
      if (fromPos > lineObj.to) fromPos = lineObj.from;
      if (fromPos < lineObj.from) fromPos = lineObj.from;

      diagnostics.push({
        from: fromPos,
        to: toPos,
        severity: ann.type === 'warning' ? 'warning' : 'error',
        message: ann.text,
        source: 'C/C++'
      });
    }
  });
  return diagnostics;
}

export async function runLinter(session, file) {
  const settings = getSettings();
  const linterMode = settings.enableLinter;

  if (linterMode === 'disable') {
    lintPending = null;
    clearLinterState(session);
    clearAllLogs();
    return;
  }
  if (lintInProgress) {
    // Don't drop the request: the user kept typing while gcc was running.
    // Remember it and lint the newest code as soon as the current run ends.
    lintPending = { session, file };
    return;
  }

  const ok = await ensureCDeps();
  if (!ok || !file) return;

  const editor = editorManager.editor;
  if (!editor) return;

  const isCM6 = typeof editor.dispatch === 'function';
  if (isCM6 && !editor.state) return;
  if (!isCM6 && !session) return;

  lintInProgress = true;
  clearLinterState(session);
  clearAllLogs();

  const errorMapForThisRun = new Map();
  let errorLinesForMinimap = [];
  let lintedContent = null; // exact text this run checked

  try {
    const fileName = Url.basename(file.filename);
    const fileContent = isCM6 ? editor.state.doc.toString() : session.getValue();
    lintedContent = fileContent;

    const project = await prepareProject(file, fileContent, true);
    if (!project) {
      console.error('[Linter Debug] ❌ prepare failed');
      throw new Error('Failed to prepare project');
    }

    const output = await lintInOneShot(
      project.projectDir,
      project.fileContents,
      project.mainFileName,
      project.isCpp
    );

    console.log('[Linter Debug] Raw output length:', output?.length ?? 0);
    if (output) console.log('[Linter Debug] Output head:', output.slice(0, 500));

    let annotations = [];
    if (output && output.trim()) {
      annotations = parseCompilerErrors(output, fileName);
      console.log(`[Linter Debug] Parsed ${annotations.length} diagnostics`);
    } else {
      console.log('[Linter Debug] No compiler output (clean or empty)');
    }

    // Always update Problems panel store (even when empty → clears file)
    const fileKey = file.uri || file.filename || fileName;
    setFileProblems(
      fileKey,
      fileName,
      file.uri || '',
      annotations.map(a => ({
        type: a.type,
        row: a.row,
        column: a.column,
        text: a.text
      }))
    );

    if (annotations.length > 0) {
      if (isCM6) {
        try {
          const cmLint = acode.require('@codemirror/lint');
          if (cmLint?.setDiagnostics) {
            const diagnostics = getCM6Diagnostics(annotations, editor);
            editor.dispatch(cmLint.setDiagnostics(editor.state, diagnostics));
            console.log('[Linter Debug] CM6 diagnostics applied');
          } else {
            console.warn('[Linter Debug] @codemirror/lint not available — inline only');
          }
        } catch (cmErr) {
          console.warn('[Linter Debug] CM6 setDiagnostics failed:', cmErr);
        }
        annotations.forEach(err => {
          if (!errorMapForThisRun.has(err.row)) errorMapForThisRun.set(err.row, []);
          errorMapForThisRun.get(err.row).push({ type: err.type, output: err.text });
        });
      } else {
        if (linterMode === 'linter' || linterMode === 'both') {
          session.setAnnotations(annotations);
          annotations.forEach(err => {
            const line = session.getLine(err.row);
            if (line !== undefined && window.ace) {
              const range = new ace.Range(err.row, err.column, err.row, line.length);
              const cls = err.type === 'warning'
                ? 'acode-c-linter-underline-warning'
                : 'acode-c-linter-underline-error';
              const id = session.addMarker(range, cls, 'text');
              currentErrorMarkers.push(id);
            }
          });
        }
        if (linterMode === 'inline' || linterMode === 'both') {
          annotations.forEach(err => {
            if (!errorMapForThisRun.has(err.row)) errorMapForThisRun.set(err.row, []);
            errorMapForThisRun.get(err.row).push({ type: err.type, output: err.text });
          });
        }
      }

      annotations.forEach(err => {
        errorLinesForMinimap.push(err.row + 1);
      });
    }

    if (window.minimap && typeof window.minimap.highlightLines === 'function') {
      window.minimap.highlightLines([...new Set(errorLinesForMinimap)]);
    }
  } catch (err) {
    console.error('[Linter Debug] ❌ Exception:', err);
  } finally {
    lintInProgress = false;
    if (isCM6 || linterMode === 'inline' || linterMode === 'both') {
      updateLogMap(errorMapForThisRun);
    } else {
      updateLogMap(new Map());
    }
    if (lintPending) {
      const next = lintPending;
      lintPending = null;
      // only re-lint if the text really changed since this run started
      const ed = editorManager.editor;
      const nowText = ed
        ? (typeof ed.dispatch === 'function' ? ed.state?.doc?.toString() : next.session?.getValue())
        : null;
      if (next.file === editorManager.activeFile && nowText !== null && nowText !== lintedContent) {
        setTimeout(() => runLinter(next.session, next.file), 0);
      }
    }
  }
}
