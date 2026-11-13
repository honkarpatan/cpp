// src/libraries/index.js — wires the Libraries feature to Acode (executor, page, editor).
import { executeCommand } from '../terminalManager.js';
import { createLibManager } from './libManager.js';
import { createLibraryPage } from './libraryPage.js';
import { planIncludeInsert } from './catalog.js';

export { detectLibraries, buildFlagsShell, buildFlagsGroup, missingHeaderHint } from './catalog.js';

const CPP_EXT = /\.(c|cpp|cxx|cc|c\+\+|h|hpp|hh|hxx)$/i;

let manager = null;
let page = null;

function activeCppFile() {
  const f = window.editorManager?.activeFile;
  return f && CPP_EXT.test(f.filename || f.name || '') ? f : null;
}

function readEditorText() {
  const ed = window.editorManager?.editor;
  if (!ed) return null;
  if (typeof ed.dispatch === 'function' && ed.state?.doc) return ed.state.doc.toString();
  if (ed.session?.getValue) return ed.session.getValue();
  return null;
}

function getActiveSource() {
  const file = activeCppFile();
  const text = file ? readEditorText() : null;
  if (text == null) return null;
  const name = file.filename || file.name || '';
  return { text, fileName: name, localFiles: [name] };
}

function insertInclude(line) {
  if (!activeCppFile()) return 'no-editor';
  const ed = window.editorManager?.editor;
  const text = readEditorText();
  if (!ed || text == null) return 'no-editor';
  const plan = planIncludeInsert(text, line);
  if (plan.status === 'exists') return 'exists';
  if (typeof ed.dispatch === 'function' && ed.state) {
    ed.dispatch({ changes: { from: plan.offset, insert: plan.insert } });
  } else if (ed.session?.insert) {
    const before = text.slice(0, plan.offset).split('\n');
    ed.session.insert({ row: before.length - 1, column: before[before.length - 1].length }, plan.insert);
  } else {
    return 'no-editor';
  }
  return 'inserted';
}

async function copy(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const cb = window.cordova?.plugins?.clipboard;
  if (cb?.copy) return cb.copy(text);
  throw new Error('no clipboard');
}

export function getLibManager() {
  if (!manager) manager = createLibManager({ exec: (cmd) => executeCommand(cmd, true) });
  return manager;
}

export function openLibraries() {
  if (!page) {
    page = createLibraryPage({
      Page: acode.require('page'),
      actionStack: acode.require('actionStack'),
      manager: getLibManager(),
      toast: (m, ms) => acode.require('toast')(m, ms),
      confirm: (title, msg) => acode.require('confirm')(title, msg),
      copy,
      getActiveSource,
      insertInclude,
    });
  }
  page.open();
}

export function closeLibraries() {
  try { page?.close(); } catch (_) {}
}

export function destroyLibraries() {
  try { page?.destroy(); } catch (_) {}
  page = null;
  manager = null;
}
