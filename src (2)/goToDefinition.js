// src/goToDefinition.js
import { adaptEditor } from './adaptEditor.js';
import { getSettings } from './settings.js';

const toast = acode.require('toast');
const fs = acode.require('fs');
const Url = acode.require('Url');
const EditorFile = acode.require('EditorFile');

function getWordUnderCursor(editorRaw, isCM6) {
  if (isCM6) {
    try {
      const state = editorRaw.state;
      const sel = state.selection.main;
      if (sel.from !== sel.to) {
        const selectedText = state.sliceDoc(sel.from, sel.to);
        if (selectedText && selectedText.trim() !== '') return selectedText.trim();
      }
      let word = state.wordAt(sel.head);
      if (!word && sel.head > 0) word = state.wordAt(sel.head - 1);
      return word ? word.text : null;
    } catch (e) {
      console.error('[GoToDef] CM6 extraction error:', e);
      return null;
    }
  }
  try {
    const selectedText = editorRaw.getSelectedText?.();
    if (selectedText && selectedText.trim() !== '') return selectedText.trim();
    const pos = editorRaw.getCursorPosition();
    const session = editorRaw.session;
    const range = session.getWordRange(pos.row, pos.column);
    return session.getTextRange(range);
  } catch (_) {
    return null;
  }
}

/** Select/highlight `symbol` on 0-based line (CM6 or Ace). */
function highlightSymbol(editorRaw, line0, symbol) {
  if (!editorRaw || !symbol) return;
  const isCM6 = typeof editorRaw.dispatch === 'function';
  try {
    if (isCM6 && editorRaw.state?.doc) {
      const line = editorRaw.state.doc.line(
        Math.min(Math.max(1, line0 + 1), editorRaw.state.doc.lines)
      );
      const idx = line.text.indexOf(symbol);
      let from = line.from;
      let to = line.from;
      if (idx >= 0) {
        from = line.from + idx;
        to = from + symbol.length;
      }
      editorRaw.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: true,
      });
      try {
        editorRaw.focus?.();
      } catch (_) {}
      return;
    }
    // Ace
    const row = line0;
    const lineText = editorRaw.session?.getLine?.(row) || '';
    const col = Math.max(0, lineText.indexOf(symbol));
    const endCol = col >= 0 ? col + symbol.length : 0;
    if (editorRaw.gotoLine) editorRaw.gotoLine(row + 1, col, true);
    if (editorRaw.selection?.setSelectionRange) {
      editorRaw.selection.setSelectionRange({
        start: { row, column: Math.max(0, col) },
        end: { row, column: endCol },
      });
    } else if (editorRaw.session?.selection) {
      editorRaw.session.selection.moveCursorTo(row, Math.max(0, col));
      editorRaw.session.selection.selectTo(row, endCol);
    }
    try {
      editorRaw.focus?.();
    } catch (_) {}
  } catch (e) {
    console.warn('[GoToDef] highlight', e);
  }
}

function findDefinitionRow(content, targetWord, isCurrentFile, cursorRow) {
  const lines = content.split('\n');
  const tw = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    {
      regex: new RegExp(
        `(?:[a-zA-Z_][a-zA-Z0-9_<>]*)\\s+[\\*&\\s]*(?:[a-zA-Z_][a-zA-Z0-9_]*::)?${tw}\\s*\\(`
      ),
      type: 'func',
    },
    {
      regex: new RegExp(`(?:class|struct|enum|union)\\s+${tw}\\s*(?:\\{|:|$)`),
      type: 'struct',
    },
    { regex: new RegExp(`^\\s*#define\\s+${tw}(?:\\s|\\(|$)`), type: 'macro' },
    {
      regex: new RegExp(`(?:[a-zA-Z_][a-zA-Z0-9_]*::)${tw}\\s*\\(`),
      type: 'constructor',
    },
    {
      regex: new RegExp(
        `(?:^|\\s|\\()(?:(?:const|volatile|static|auto|register|extern|unsigned|signed|long|short)\\s+)*([a-zA-Z_][a-zA-Z0-9_<>:]+)\\s+[\\*&\\s]*${tw}\\s*(?:[;=\\[\\,\\)]|$)`
      ),
      type: 'var',
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    if (isCurrentFile && i === cursorRow) continue;
    const line = lines[i];
    if (!line.includes(targetWord)) continue;
    for (const p of patterns) {
      if (!p.regex.test(line)) continue;
      if (p.type === 'func') {
        const equalIdx = line.indexOf('=');
        const wordIdx = line.indexOf(targetWord);
        if (equalIdx !== -1 && equalIdx < wordIdx) continue;
        if (/^\s*return\s+/.test(line)) continue;
      }
      if (p.type === 'var') {
        const match = line.match(p.regex);
        if (match) {
          const typeName = match[1];
          const invalidTypes = [
            'return', 'if', 'else', 'while', 'for', 'switch', 'case', 'goto',
            'sizeof', 'new', 'delete', 'throw', 'catch',
          ];
          if (invalidTypes.includes(typeName)) continue;
        }
      }
      return i;
    }
  }
  return -1;
}

async function tryLspDefinition() {
  try {
    const lsp = acode.require('lsp');
    if (lsp?.executeCommand) {
      await lsp.executeCommand('editor.action.revealDefinition');
      return true;
    }
  } catch (_) {}
  return false;
}

export async function executeGoToDefinition() {
  const settings = getSettings();
  if (!settings.enableGoToDefinition) return;

  const editorRaw = editorManager?.editor;
  const activeFile = editorManager?.activeFile;
  if (!editorRaw || !activeFile) return;

  const isCM6 = typeof editorRaw.dispatch === 'function';
  const editor = adaptEditor(editorRaw);

  let targetWord = getWordUnderCursor(editorRaw, isCM6);
  if (!targetWord || targetWord.trim() === '') {
    toast('No valid symbol selected');
    return;
  }
  targetWord = targetWord.trim();

  // Try LSP first (clangd) — opens other files + proper highlight when running
  if (await tryLspDefinition()) return;

  const cursorRow = editor.getCursorPosition().row;
  const currentFileContent = editor.session.getValue();
  const localRow = findDefinitionRow(currentFileContent, targetWord, true, cursorRow);

  if (localRow !== -1) {
    highlightSymbol(editorRaw, localRow, targetWord);
    toast('Found in current file');
    return;
  }

  toast(`Searching ${targetWord}…`);
  const fileUri = activeFile.uri;
  if (fileUri) {
    try {
      const dirUri = Url.dirname(fileUri);
      const files = await fs(dirUri).lsDir();
      for (const f of files) {
        if (!(f.isFile && f.url !== fileUri && /\.(c|cpp|cc|cxx|h|hpp)$/i.test(f.name))) {
          continue;
        }
        const siblingContent = await fs(f.url).readFile('utf8');
        const targetRow = findDefinitionRow(siblingContent, targetWord, false, -1);
        if (targetRow === -1) continue;

        toast(`Found in ${f.name}`);
        let existingFile = editorManager.getFile(f.url, 'uri');
        if (existingFile) {
          existingFile.makeActive();
        } else {
          new EditorFile(f.name, { uri: f.url });
        }

        const jump = () => {
          const ed = editorManager.editor;
          if (!ed) return false;
          highlightSymbol(ed, targetRow, targetWord);
          return true;
        };
        if (!jump()) {
          setTimeout(jump, 200);
          setTimeout(jump, 500);
          setTimeout(jump, 900);
        }
        return;
      }
    } catch (e) {
      console.error('[GoToDef] siblings', e);
    }
  }

  toast(`Definition not found for '${targetWord}'`);
}

/**
 * Trigger rename — tries native LSP/commands, then local same-file prompt.
 * Heavy console logging: filter [CppRename] in Acode console.
 */
export async function executeRenameSymbol() {
  const toast = acode.require('toast');
  const log = (...a) => {
    try {
      console.log('[CppRename]', ...a);
    } catch (_) {}
  };
  const logErr = (...a) => {
    try {
      console.warn('[CppRename]', ...a);
    } catch (_) {}
  };

  log('======= rename start =======');

  const editorRaw = editorManager?.editor;
  const file = editorManager?.activeFile;
  log('file=', file?.filename || file?.name || '(none)', 'uri=', file?.uri || '');
  log('editor=', !!editorRaw, 'cm6=', !!(editorRaw && typeof editorRaw.dispatch === 'function'));

  // Inspect available APIs once
  let lsp = null;
  let commands = null;
  try {
    lsp = acode.require('lsp');
  } catch (e) {
    logErr('acode.require(lsp) threw', e);
  }
  try {
    commands = acode.require('commands');
  } catch (e) {
    logErr('acode.require(commands) threw', e);
  }

  if (lsp) {
    log('lsp keys=', Object.keys(lsp).join(','));
    if (lsp.clientManager) {
      try {
        log('clientManager keys=', Object.keys(lsp.clientManager).join(','));
      } catch (_) {
        log('clientManager typeof=', typeof lsp.clientManager);
      }
    } else {
      log('clientManager= missing');
    }
  } else {
    log('lsp module= null');
  }

  if (commands) {
    log(
      'commands keys sample=',
      Object.keys(commands)
        .slice(0, 40)
        .join(',')
    );
    log(
      'commands.exec=',
      typeof commands.exec,
      'execute=',
      typeof commands.execute,
      'add=',
      typeof commands.add
    );
  } else {
    log('commands module= null');
  }

  /**
   * tryCall: only treat as success when result is explicitly true/object,
   * or when fn returns a Promise that resolves to non-false.
   * Bare undefined from exec is NOT success (Acode often no-ops silently).
   */
  const tryCall = async (label, fn, { acceptUndefined = false } = {}) => {
    try {
      log('try:', label);
      const result = await Promise.resolve(fn());
      log('  result typeof=', typeof result, 'value=', result);
      if (result === false || result === null) {
        log('  → fail (false/null)');
        return false;
      }
      if (result === undefined || result === '') {
        if (acceptUndefined) {
          log('  → accept undefined as maybe-ok');
          return true;
        }
        log('  → not counted as success (undefined)');
        return false;
      }
      log('  → success');
      return true;
    } catch (e) {
      logErr('  threw:', e?.message || e, e);
      return false;
    }
  };

  // ---- 1) commands ----
  if (commands) {
    for (const name of [
      'editor.action.rename',
      'rename',
      'renameSymbol',
      'lsp:rename',
      'clangd.rename',
      'editor.rename',
    ]) {
      if (typeof commands.exec === 'function') {
        // don't return early on undefined
        await tryCall('commands.exec(' + name + ')', () => commands.exec(name));
      }
      if (typeof commands.execute === 'function') {
        await tryCall('commands.execute(' + name + ')', () => commands.execute(name));
      }
    }
    // list command names if available
    try {
      if (typeof commands.list === 'function') {
        const list = commands.list();
        const names = Array.isArray(list)
          ? list.map((c) => c.name || c.id || c).filter((n) => /rename|lsp/i.test(String(n)))
          : [];
        log('commands.list rename-ish=', names.join(',') || '(none)');
      }
    } catch (e) {
      logErr('commands.list', e);
    }
  }

  // ---- 2) lsp ----
  if (lsp) {
    if (typeof lsp.executeCommand === 'function') {
      const ok = await tryCall('lsp.executeCommand(editor.action.rename)', () =>
        lsp.executeCommand('editor.action.rename')
      );
      if (ok) {
        log('done via lsp.executeCommand');
        return;
      }
    } else {
      log('lsp.executeCommand not a function');
    }
    if (typeof lsp.rename === 'function') {
      const ok = await tryCall('lsp.rename()', () => lsp.rename());
      if (ok) {
        log('done via lsp.rename');
        return;
      }
    }
    const cm = lsp.clientManager;
    if (cm) {
      for (const key of Object.keys(cm)) {
        if (/rename/i.test(key)) log('clientManager has method-like key:', key, typeof cm[key]);
      }
      if (typeof cm.rename === 'function') {
        const ok = await tryCall('clientManager.rename()', () => cm.rename());
        if (ok) {
          log('done via clientManager.rename');
          return;
        }
      }
      if (typeof cm.executeCommand === 'function') {
        const ok = await tryCall('clientManager.executeCommand(rename)', () =>
          cm.executeCommand('editor.action.rename')
        );
        if (ok) {
          log('done via clientManager.executeCommand');
          return;
        }
      }
      // Some builds: getClient().request('textDocument/rename', ...)
      try {
        const client =
          (typeof cm.getClient === 'function' && cm.getClient()) ||
          (typeof cm.client === 'object' && cm.client) ||
          null;
        if (client) {
          log('client keys=', Object.keys(client).slice(0, 30).join(','));
        }
      } catch (e) {
        logErr('getClient', e);
      }
    }
  }

  // ---- 3) editor ----
  if (editorRaw) {
    log(
      'editor.execCommand=',
      typeof editorRaw.execCommand,
      'commands=',
      !!editorRaw.commands
    );
    if (typeof editorRaw.execCommand === 'function') {
      await tryCall('editor.execCommand(rename)', () => editorRaw.execCommand('rename'));
    }
    if (editorRaw.commands && typeof editorRaw.commands.exec === 'function') {
      await tryCall('editor.commands.exec(rename)', () =>
        editorRaw.commands.exec('rename', editorRaw)
      );
    }
  }

  // ---- 4) Local prompt rename (reliable fallback) ----
  log('falling back to local prompt rename');
  try {
    let promptFn = null;
    try {
      promptFn = acode.require('prompt');
    } catch (e) {
      logErr('prompt require failed', e);
    }
    log('prompt typeof=', typeof promptFn);

    if (!editorRaw) {
      toast('No editor', 1500);
      log('abort: no editor');
      return;
    }
    if (typeof promptFn !== 'function') {
      toast('Prompt API missing', 2000);
      log('abort: no prompt');
      return;
    }

    let oldName = '';
    const isCM6 = typeof editorRaw.dispatch === 'function';
    try {
      if (isCM6) {
        const sel = editorRaw.state.selection.main;
        log('cm6 sel', sel.from, sel.to, 'head', sel.head);
        if (sel.from !== sel.to) {
          oldName = editorRaw.state.sliceDoc(sel.from, sel.to);
        } else {
          let w = editorRaw.state.wordAt(sel.head);
          if (!w && sel.head > 0) w = editorRaw.state.wordAt(sel.head - 1);
          oldName = (w && w.text) || '';
          log('cm6 wordAt=', w);
        }
      } else {
        oldName = (editorRaw.getSelectedText && editorRaw.getSelectedText()) || '';
        if (!oldName) {
          const pos = editorRaw.getCursorPosition();
          const range = editorRaw.session.getWordRange(pos.row, pos.column);
          oldName = editorRaw.session.getTextRange(range);
          log('ace pos', pos, 'range', range);
        }
      }
    } catch (e) {
      logErr('symbol extract', e);
    }

    oldName = String(oldName || '').trim();
    log('oldName=', JSON.stringify(oldName));
    if (!oldName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(oldName)) {
      toast('Place cursor on a symbol to rename', 2000);
      log('abort: invalid symbol');
      return;
    }

    let newName;
    try {
      // Acode prompt signatures vary — try common forms
      newName = await promptFn('Rename symbol', oldName, 'text', {
        match: /^[A-Za-z_][A-Za-z0-9_]*$/,
        required: true,
      });
      log('prompt result (4-arg)=', newName);
    } catch (e1) {
      logErr('prompt 4-arg failed', e1);
      try {
        newName = await promptFn('Rename to', oldName);
        log('prompt result (2-arg)=', newName);
      } catch (e2) {
        logErr('prompt 2-arg failed', e2);
        toast('Prompt failed', 2000);
        return;
      }
    }

    if (newName == null || newName === false) {
      log('user cancelled prompt');
      return;
    }
    newName = String(newName).trim();
    if (!newName || newName === oldName) {
      log('abort: empty or same name');
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) {
      toast('Invalid identifier', 1500);
      log('abort: invalid newName', newName);
      return;
    }

    const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + esc + '\\b', 'g');

    if (isCM6) {
      const full = editorRaw.state.doc.toString();
      const changes = [];
      let m;
      while ((m = re.exec(full)) !== null) {
        changes.push({ from: m.index, to: m.index + oldName.length, insert: newName });
      }
      log('cm6 matches=', changes.length);
      if (!changes.length) {
        toast('No occurrences in this file', 1500);
        return;
      }
      changes.sort((a, b) => b.from - a.from);
      editorRaw.dispatch({ changes });
      toast('Renamed ' + changes.length + '× in this file', 2000);
      log('done local cm6 rename count=', changes.length);
      return;
    }

    const session = editorRaw.session;
    const full = session.getValue();
    const next = full.replace(re, newName);
    const count = (full.match(re) || []).length;
    log('ace matches=', count);
    if (next === full) {
      toast('No occurrences in this file', 1500);
      return;
    }
    session.setValue(next);
    toast('Renamed ' + count + '× in this file', 2000);
    log('done local ace rename count=', count);
  } catch (e) {
    logErr('local rename fatal', e);
    toast('Rename failed — see console [CppRename]', 3000);
  }
  log('======= rename end =======');
}
