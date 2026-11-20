/**
 * toolsPanel.js — C/C++ Tools side button
 */
import { getSettings } from './settings.js';
import { executeGoToDefinition } from './goToDefinition.js';
import { executeFindReferences } from './findReferences.js';
import { runLinter } from './linter.js';
import { openProblemsPagePublic } from './problemsPage.js';

const SideButton = acode.require('sideButton');
const select = acode.require('select');
const toast = acode.require('toast');

let sideButton = null;
let fileSwitchHandler = null;

function isCppFile(file) {
  return !!(file && /\.(c|cpp|cxx|cc|h|hpp)$/i.test(file.filename || file.name || ''));
}

const TOOL_ACTIONS = [
  ['gotoDef', 'Go to Definition'],
  ['findRefs', 'Find References'],
  ['rename', 'Rename symbol'],
  ['addTopPath', 'Add top commented path'],
  ['lint', 'Lint now'],
  ['format', 'Format document'],
  ['autoImport', 'Auto import headers'],
  ['problems', 'Open Problems'],
  ['libraries', 'Libraries…'],
  ['deps', 'Dependencies…'],
  ['runTerm', 'Run in terminal'],
  ['runPopup', 'Run · popup'],
  ['runInline', 'Run · inline logs'],
];

/** Insert // <path> at the very top of the active C/C++ file */
async function addTopCommentedPath() {
  const file = editorManager?.activeFile;
  if (!isCppFile(file)) return toast('Open a C/C++ file', 1200);
  const editor = editorManager?.editor;
  const path =
    file.uri ||
    file.filename ||
    file.name ||
    'untitled';
  const line = `// ${path}\n`;
  try {
    if (editor?.dispatch && editor.state) {
      const doc = editor.state.doc;
      const head = doc.sliceString(0, Math.min(200, doc.length));
      if (head.startsWith(`// ${path}`) || head.startsWith('// ' + (file.filename || ''))) {
        return toast('Path comment already at top', 1500);
      }
      editor.dispatch({ changes: { from: 0, insert: line } });
    } else if (editor?.session?.insert) {
      editor.session.insert({ row: 0, column: 0 }, line);
    } else if (file.session?.insert) {
      file.session.insert({ row: 0, column: 0 }, line);
    } else {
      return toast('Could not edit file', 1500);
    }
    toast('Path comment added', 1200);
  } catch (e) {
    toast('Failed: ' + (e?.message || e), 2000);
  }
}

async function handleAction(id) {
  if (id === 'gotoDef') return executeGoToDefinition();
  if (id === 'rename') {
    try {
      console.log('[CppRename] tools panel → executeRenameSymbol');
      const { executeRenameSymbol } = await import('./goToDefinition.js');
      await executeRenameSymbol();
    } catch (e) {
      console.warn('[CppRename] tools panel error', e);
      toast('Rename: ' + (e?.message || e), 2000);
    }
    return;
  }
  if (id === 'findRefs') return executeFindReferences();
  if (id === 'addTopPath') return addTopCommentedPath();
  if (id === 'lint') {
    try {
      const f = editorManager?.activeFile;
      await runLinter(f?.session, f);
    } catch (e) {
      toast('Lint: ' + (e?.message || e), 2000);
    }
    return;
  }
  if (id === 'format') {
    try {
      const { formatDocument } = await import('./formatter.js');
      if (typeof formatDocument === 'function') await formatDocument();
      else toast('Use Acode Format menu', 1500);
    } catch (e) {
      toast('Format: ' + (e?.message || e), 2000);
    }
    return;
  }
  if (id === 'autoImport') {
    try {
      const { analyzeAndImportHeaders } = await import('./autoImport.js');
      await analyzeAndImportHeaders(editorManager?.activeFile?.session);
      toast('Headers analyzed', 1200);
    } catch (e) {
      toast('Import: ' + (e?.message || e), 2000);
    }
    return;
  }
  if (id === 'problems') {
    try {
      openProblemsPagePublic();
    } catch (_) {
      toast('Problems', 1200);
    }
    return;
  }
  if (id === 'libraries') {
    try {
      const { openLibraries } = await import('./libraries/index.js');
      openLibraries();
    } catch (e) {
      toast('Libraries: ' + (e?.message || e), 2000);
    }
    return;
  }
  if (id === 'deps') {
    try {
      // depsPicker.openDepsPicker() needs scan data (opts.items); the checker scans
      // first and then fills the picker, so go through it.
      const { checkDependenciesAction } = await import('./dependencyChecker.js');
      await checkDependenciesAction();
    } catch (e) {
      toast('Deps: ' + (e?.message || e), 2000);
    }
    return;
  }
  if (id === 'runTerm' || id === 'runPopup' || id === 'runInline') {
    const mode =
      id === 'runTerm' ? 'terminal' : id === 'runPopup' ? 'popup' : 'inline';
    try {
      const { compileAndRun } = await import('./runner.js');
      await compileAndRun(editorManager?.activeFile, { mode });
    } catch (e) {
      toast('Run: ' + (e?.message || e), 2000);
    }
  }
}

async function openToolsMenu() {
  if (!isCppFile(editorManager?.activeFile)) return toast('Open a C/C++ file', 1200);
  try {
    const choice = await select('C/C++ Tools', TOOL_ACTIONS, { hideOnSelect: true });
    if (choice) await handleAction(choice);
  } catch (_) {}
}

export function setToolsSideButtonVisible(visible) {
  try {
    visible ? sideButton?.show?.() : sideButton?.hide?.();
  } catch (_) {}
}

export function registerToolsPanel() {
  if (getSettings().showToolsSideButton === false) return;
  try {
    if (!sideButton && SideButton) {
      sideButton = SideButton({
        text: 'C/C++ Tools',
        icon: 'code',
        onclick: () => openToolsMenu(),
      });
      sideButton.show();
    }
  } catch (e) {
    console.warn('[CppTools]', e);
  }
  fileSwitchHandler = () => {
    setToolsSideButtonVisible(
      isCppFile(editorManager?.activeFile) && getSettings().showToolsSideButton !== false
    );
  };
  try {
    editorManager?.on?.('switch-file', fileSwitchHandler);
  } catch (_) {}
  fileSwitchHandler();
}

export function unregisterToolsPanel() {
  try {
    if (fileSwitchHandler) editorManager?.off?.('switch-file', fileSwitchHandler);
  } catch (_) {}
  try {
    sideButton?.hide?.();
  } catch (_) {}
  sideButton = null;
  fileSwitchHandler = null;
}
