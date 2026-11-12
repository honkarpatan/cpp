// src/initPlugin.js 
import { runLinter, clearLinterState } from './linter.js';
import { cleanupRunner } from './runner.js';
import { registerAcodeCompleter, removeCompleter } from './completer.js';
import { getSettings } from './settings.js';
import { ensureCDeps } from './dependencyChecker.js';
import { initFormatter, destroyFormatter } from './formatter.js';
import { handleEditorUpdate, clearAllLogs, hidePopup } from './inlineDisplay.js';
import { initializeTreeSitter } from './treeSitterManager.js';
import { analyzeAndImportHeaders } from './autoImport.js';
import runButtonManager from './runButtonManager.js';
import { initInputChips, destroyInputChips, scheduleRefresh as refreshInputChips } from './inputChips.js';
import { initInlineRunOutput, destroyInlineRunOutput } from './inlineRunOutput.js';

import { executeGoToDefinition } from './goToDefinition.js'; 
import {
  showContextMenu,
  hideContextMenu,
  registerGoToDefSelectionMenu,
  registerGotoDefIcon
} from './customContextMenu.js';

// 🚀 NEW: LSP Import
import { registerClangdServer, unregisterClangdServer } from './lspServer.js';
import { initProblemsUI, destroyProblemsUI, onActiveFileChanged } from './problemsPage.js';

let currentFile = null;
let currentSession = null;
let lintTimeout = null;
let autoImportTimeout = null; 
let editorChangeListenerAttached = false; 

let lastLintedCode = ""; 

async function runAutoImportAnalysis() { 
    if (!currentFile || currentFile !== editorManager.activeFile) return;
    const settings = getSettings();
    if (!settings.enableTreeSitterAnalysis || !/\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile.filename)) return;
    await analyzeAndImportHeaders(currentSession || editorManager.activeFile?.session);
}

function checkFileAndSetup() {
    const activeFile = editorManager.activeFile;
    const oldSession = currentSession;
    currentFile = activeFile;
    currentSession = activeFile?.session;

    hideContextMenu(); 

    if (oldSession && oldSession !== currentSession) {
        clearLinterState(oldSession); 
        removeCompleter();
        clearAllLogs(); 
        lastLintedCode = ""; 
    }

    const isCppFile = currentFile && /\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile.filename);

    // Problems side button: only on C/C++ tabs
    try { onActiveFileChanged(); } catch (_) {}

    if (isCppFile) {
        registerAcodeCompleter();
        const settings = getSettings();
        if (settings.enableLinter !== 'disable' && currentFile) {
            ensureCDeps().then(ok => {
                if (ok && currentFile === editorManager.activeFile) { 
                    runLinter(currentSession, currentFile); 
                }
            });
        }
        triggerDebouncedLint('checkFileAndSetup');
        try { refreshInputChips(); } catch (_) {}
    } else {
        if (oldSession && (!currentFile || !/\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile?.filename || ''))) {
             const settings = getSettings();
             if (settings && settings.enableLinter !== 'disable'){ 
                 clearLinterState(oldSession);
                 clearAllLogs();
             }
        }
        removeCompleter();
    }
}

function triggerDebouncedLint(source) {
    clearTimeout(lintTimeout);
    if (!currentFile || !/\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile.filename)) return;

    // Autocomplete needs faster refresh than pure typing debounce
    const delay = source === 'CM6 docChanged' ? 280 : 600;

    lintTimeout = setTimeout(async () => {
        if (!currentFile || currentFile !== editorManager.activeFile) return;
        const settings = getSettings();
        if (settings.enableLinter === 'disable') return;

        const editor = editorManager.editor;
        if (!editor) return;

        const isCM6 = typeof editor.dispatch === 'function';
        if (isCM6 && !editor.state) return;
        if (!isCM6 && !currentSession) return;

        const currentCode = isCM6 ? editor.state.doc.toString() : currentSession.getValue();
        if (currentCode === lastLintedCode) return;

        const ok = await ensureCDeps();
        if (!ok || currentFile !== editorManager.activeFile) return;

        const codeToLint = isCM6 ? editor.state.doc.toString() : currentSession.getValue();
        await runLinter(currentSession, currentFile);

        const after = isCM6
          ? (editorManager.editor?.state?.doc?.toString?.() ?? '')
          : (currentSession?.getValue?.() ?? '');
        if (after === codeToLint) {
          lastLintedCode = codeToLint;
        } else {
          // Buffer changed during lint (completion applied) — force another pass
          lastLintedCode = '';
          triggerDebouncedLint('post-lint-dirty');
        }
    }, delay);
}

const onEditorChangeText = (sourceEvent) => {
    hidePopup(); 
    hideContextMenu(); 

    if (currentFile && /\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile.filename)) {
        triggerDebouncedLint(sourceEvent); 
        
        const settings = getSettings();
        if (settings.autoImportTrigger === 'onKeypress') {
            clearTimeout(autoImportTimeout);
            autoImportTimeout = setTimeout(runAutoImportAnalysis, 2500); 
        }
        handleEditorUpdate();
        try { refreshInputChips(); } catch (_) {}
    }
};

// Custom floating "Go to Def" popup removed — uses Acode selectionMenu instead.
const handleSelectionEnd = () => {};


const cm6GlobalListeners = {
    input: (e) => {
        if (e.target?.closest?.('.cm-content')) onEditorChangeText('CM6 Global Input');
    },
    keyup: (e) => {
        if (e.target?.closest?.('.cm-content')) onEditorChangeText('CM6 Global Keyup');
    },
    click: (e) => {
        hideContextMenu(); 
        if (e.target?.closest?.('.cm-content') && currentFile && /\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile.filename)) {
            handleEditorUpdate();
        }
    }
};

function attachEditorChangeListener() {
    if (editorChangeListenerAttached) return;

    const editor = editorManager.editor;
    if (!editor) {
        setTimeout(attachEditorChangeListener, 500);
        return;
    }

    const isCM6 = typeof editor.dispatch === 'function';

    if (isCM6) {
        document.addEventListener('input', cm6GlobalListeners.input, { capture: true });
        document.addEventListener('keyup', cm6GlobalListeners.keyup, { capture: true });
        document.addEventListener('click', cm6GlobalListeners.click, { capture: true });
        if (typeof editor.on === 'function') editor.on('change', () => onEditorChangeText('CM6 Native Change'));

        // CRITICAL: autocomplete / snippet apply use CM6 transactions — they do NOT
        // fire DOM input/keyup. Without updateListener, diagnostics stay stale
        // (e.g. "#in" error remains after completing to "#include").
        try {
          const cmView = acode.require('@codemirror/view');
          const cmState = acode.require('@codemirror/state');
          if (cmView?.EditorView?.updateListener && cmState?.Compartment && !cm6UpdateAttached) {
            if (!cm6UpdateCompartment) cm6UpdateCompartment = new cmState.Compartment();
            const listener = cmView.EditorView.updateListener.of((update) => {
              if (!update.docChanged) return;
              onEditorChangeText('CM6 docChanged');
            });
            const existing = cm6UpdateCompartment.get(editor.state);
            if (existing === undefined) {
              editor.dispatch({
                effects: cmState.StateEffect.appendConfig.of(cm6UpdateCompartment.of(listener)),
              });
            } else {
              editor.dispatch({ effects: cm6UpdateCompartment.reconfigure(listener) });
            }
            cm6UpdateAttached = true;
            console.log('[Init] CM6 updateListener attached for lint refresh');
          }
        } catch (e) {
          console.warn('[Init] CM6 updateListener failed', e);
        }
    } else {
        editor.on('change', () => onEditorChangeText('Ace Native Change'));
        editor.on('changeSelection', () => {
            if (currentFile && /\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile.filename)) handleEditorUpdate(); 
        });
        editor.on('scroll', () => {
            hidePopup(); 
            hideContextMenu(); 
            if (currentFile && /\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile.filename)) handleEditorUpdate(); 
        });
        if (editor.selection) {
            editor.selection.on('changeCursor', () => {
                hideContextMenu();
                if (currentFile && /\.(c|cpp|cxx|cc|h|hpp)$/i.test(currentFile.filename)) handleEditorUpdate(); 
            });
        }
    }

    document.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('touchend', handleSelectionEnd);
    document.addEventListener('scroll', hideContextMenu, true); 

    editorChangeListenerAttached = true; 
}

const onSaveAutoImport = (file) => {
    const settings = getSettings();
    const isTargetFile = file && currentFile && file.filename === currentFile.filename;
    const isCpp = /\.(c|cpp|cxx|cc|h|hpp)$/i.test(file?.filename || '');
    if (settings.autoImportTrigger === 'onSave' && isTargetFile && isCpp) runAutoImportAnalysis(); 
};

// =======================================
// PLUGIN INITIALIZATION
// =======================================
export function initPlugin(baseUrl) {
  runButtonManager.init(); 
  initFormatter(baseUrl); 
  const settings = getSettings();
  if (settings.enableTreeSitterAnalysis) initializeTreeSitter(baseUrl); 

  // 🚀 NEW: Register LSP if CM6
  const editor = editorManager.editor;
  if (editor && typeof editor.dispatch === 'function') {
      registerClangdServer();
  }

  // Problems side button + diagnosis page
  try {
    initProblemsUI();
  } catch (e) {
    console.warn('[Problems] UI init failed:', e);
  }

  // Go to Definition → acode.addIcon + selection menu
  try {
    registerGotoDefIcon();
    registerGoToDefSelectionMenu();
  } catch (e) {
    console.warn('[GoToDef] selectionMenu init failed:', e);
  }

  // Input chips (scanf / cin) — small non-intrusive chips
  try {
    initInputChips();
  } catch (e) {
    console.warn('[InputChips] init failed:', e);
  }
  try {
    initInlineRunOutput();
  } catch (e) {
    console.warn('[InlineRun] init failed:', e);
  }

  editorManager.on('switch-file', checkFileAndSetup);
  editorManager.on('rename-file', checkFileAndSetup);
  editorManager.on('save-file', onSaveAutoImport); 

  attachEditorChangeListener();

  try {
      editorManager.editor.commands.addCommand({
          name: "cpp_goto_definition",
          bindKey: { win: "Alt-D", mac: "Option-D" },
          exec: executeGoToDefinition
      });
  } catch (e) {
      console.warn("Could not register Go to Definition command:", e);
  }

  checkFileAndSetup(); 
  try { refreshInputChips(); } catch (_) {}
}

export function destroyPlugin() {
    runButtonManager.destroy(); 
    hideContextMenu(); 
    try { destroyProblemsUI(); } catch (_) {}
    try { destroyInputChips(); } catch (_) {}
    try { destroyInlineRunOutput(); } catch (_) {}

    // 🚀 NEW: Unregister LSP
    unregisterClangdServer();

    editorManager.off('switch-file', checkFileAndSetup);
    editorManager.off('rename-file', checkFileAndSetup);
    editorManager.off('save-file', onSaveAutoImport); 

    const editor = editorManager.editor;
    const isCM6 = editor && typeof editor.dispatch === 'function';

    if (editor) {
        if (typeof editor.off === 'function') {
            editor.off('change');
            if (!isCM6) {
                editor.off('changeSelection');
                editor.off('scroll');
            }
        }
        if (!isCM6 && editor.selection && typeof editor.selection.off === 'function') {
            editor.selection.off('changeCursor');
        }
    }
    
    if (isCM6 || typeof document.removeEventListener === 'function') {
        document.removeEventListener('input', cm6GlobalListeners.input, { capture: true });
        document.removeEventListener('keyup', cm6GlobalListeners.keyup, { capture: true });
        document.removeEventListener('click', cm6GlobalListeners.click, { capture: true });
    }
    
    document.removeEventListener('mouseup', handleSelectionEnd);
    document.removeEventListener('touchend', handleSelectionEnd);
    document.removeEventListener('scroll', hideContextMenu, true); 

    editorChangeListenerAttached = false; 

    const sessionToClear = currentSession || editorManager.activeFile?.session;
    const settings = getSettings();
    if(sessionToClear && settings && settings.enableLinter !== 'disable') { 
        clearLinterState(sessionToClear);
        clearAllLogs();
    }

    cleanupRunner(); 
    removeCompleter();
    destroyFormatter(); 

    currentFile = null;
    currentSession = null;
    clearTimeout(lintTimeout);
    clearTimeout(autoImportTimeout);
}