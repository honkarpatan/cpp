// src/problemsPage.js
// Problems side-button + diagnosis page for C/C++ plugin.

import { getSettings } from './settings.js';
import { getAllProblems, subscribe } from './problemsStore.js';

const SideButton = acode.require('sideButton');
const Page = acode.require('page');
const actionStack = acode.require('actionStack');
const toast = acode.require('toast');
// `tag` is global in Acode (html-tag-js) — do not redeclare

const CPP_EXT = /\.(c|cpp|cxx|cc|c\+\+|h|hpp|hh|hxx)$/i;
const PAGE_STACK_ID = 'cpp-problems-page';

let sideButton = null;
let problemsPage = null;
let unsubscribe = null;
let pageBody = null;
let fileSwitchHandler = null;

/** Collapsed file keys (fileName or uri) — persists across re-renders */
const collapsedFiles = new Set();

function isCppFile(file) {
  if (!file) return false;
  const name = file.filename || file.name || '';
  return CPP_EXT.test(name);
}

function typeIcon(type) {
  if (type === 'error') return '❌';
  if (type === 'warning') return '⚠️';
  return 'ℹ️';
}

function typeClass(type) {
  if (type === 'error') return 'cpp-prob-error';
  if (type === 'warning') return 'cpp-prob-warning';
  return 'cpp-prob-info';
}

function shortPath(uri, name) {
  if (name) return name;
  if (!uri) return '(unknown)';
  if (uri.includes('::')) return uri.split('::').pop();
  try {
    const parts = uri.replace(/^file:\/\//, '').split('/');
    return parts[parts.length - 1] || uri;
  } catch (_) {
    return uri;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

/**
 * Jump to file + line (0-based row).
 */
async function goToProblem(fileUri, fileName, row, column) {
  try {
    hideProblemsPage();

    let target = null;
    const files = editorManager.files || [];
    for (const f of files) {
      if (!f) continue;
      if (fileUri && (f.uri === fileUri || f.filename === fileUri)) {
        target = f;
        break;
      }
      if (fileName && f.filename === fileName) {
        target = f;
        break;
      }
      if (fileUri && f.uri && fileUri.includes('::') && f.uri.includes(fileUri.split('::').pop())) {
        target = f;
        break;
      }
    }

    if (target) {
      target.makeActive();
    } else if (fileUri) {
      try {
        const openFile = acode.require('openFile');
        if (typeof openFile === 'function') {
          await openFile(fileUri);
        } else if (editorManager.openFile) {
          await editorManager.openFile(fileUri);
        }
      } catch (openErr) {
        console.warn('[Problems] Could not open file:', openErr);
        toast(`Open file manually: ${fileName || fileUri}`);
      }
    }

    await new Promise(r => setTimeout(r, 200));

    const editor = editorManager.editor;
    if (!editor) return;

    const isCM6 = typeof editor.dispatch === 'function';
    const line = Math.max(0, row | 0);
    const col = Math.max(0, column | 0);

    if (isCM6) {
      try {
        if (typeof editor.gotoLine === 'function') {
          editor.gotoLine(line + 1, col);
        } else if (typeof editor.moveCursorToPosition === 'function') {
          editor.moveCursorToPosition({ row: line, column: col });
        } else {
          const doc = editor.state.doc;
          const lineObj = doc.line(Math.min(line + 1, doc.lines));
          const pos = Math.min(lineObj.from + col, lineObj.to);
          editor.dispatch({
            selection: { anchor: pos, head: pos },
            scrollIntoView: true
          });
        }
      } catch (e) {
        console.warn('[Problems] CM6 goto failed:', e);
      }
    } else {
      try {
        editor.gotoLine(line + 1, col);
        editor.focus();
      } catch (e) {
        console.warn('[Problems] Ace goto failed:', e);
      }
    }
  } catch (err) {
    console.error('[Problems] goToProblem error:', err);
  }
}

function fileCollapseKey(file) {
  return file.fileUri || file.fileName || '';
}

const COPY_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;

function formatOneProblem(file, p) {
  const pathLabel = shortPath(file.fileUri, file.fileName);
  const line = (p.row | 0) + 1;
  const col = (p.column | 0) + 1;
  const kind = (p.type || 'error').toUpperCase();
  return `${pathLabel}:${line}:${col}: ${kind}: ${p.text || ''}`;
}

function formatFileSection(file) {
  const pathLabel = shortPath(file.fileUri, file.fileName);
  const lines = [`// ${pathLabel} (${file.problems.length})`];
  for (const p of file.problems) {
    lines.push(formatOneProblem(file, p));
  }
  return lines.join('\n');
}

function formatAllProblems(files) {
  if (!files.length) return '';
  return files.map(formatFileSection).join('\n\n');
}

async function copyText(text, okMsg) {
  const t = (text || '').trim();
  if (!t) {
    toast('Nothing to copy', 2000);
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
    } else {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg || 'Copied', 2000);
  } catch (e) {
    console.warn('[Problems] copy failed', e);
    toast('Copy failed', 2500);
  }
}

function renderPageContent() {
  if (!pageBody) return;

  const { files, summary } = getAllProblems();

  let html = `
    <div class="cpp-problems-root">
      <div class="cpp-problems-toolbar">
        <div class="cpp-problems-summary">
          <span class="cpp-prob-count cpp-prob-error" title="Errors">${summary.errors}</span>
          <span class="cpp-prob-count cpp-prob-warning" title="Warnings">${summary.warnings}</span>
          <span class="cpp-prob-count cpp-prob-info" title="Info">${summary.infos}</span>
          <span class="cpp-prob-count-label">${summary.total} problem${summary.total === 1 ? '' : 's'} in ${summary.files} file${summary.files === 1 ? '' : 's'}</span>
        </div>
        <button type="button" class="cpp-prob-copy-btn cpp-prob-copy-all" title="Copy all problems" aria-label="Copy all" ${summary.total ? '' : 'disabled'}>
          ${COPY_SVG}
        </button>
      </div>
  `;

  if (summary.total === 0) {
    html += `
      <div class="cpp-problems-empty">
        <div class="cpp-problems-empty-icon">✓</div>
        <div>No problems</div>
        <div class="cpp-problems-empty-hint">C/C++ diagnostics from the plugin linter appear here.</div>
      </div>
    `;
  } else {
    html += `<div class="cpp-problems-tree">`;

    files.forEach((file, fi) => {
      const pathLabel = shortPath(file.fileUri, file.fileName);
      const key = fileCollapseKey(file);
      const isCollapsed = collapsedFiles.has(key);
      const errN = file.problems.filter(p => p.type === 'error').length;
      const warnN = file.problems.filter(p => p.type === 'warning').length;
      const infoN = file.problems.filter(p => p.type === 'info').length;

      html += `
        <div class="cpp-problems-file${isCollapsed ? ' is-collapsed' : ''}" data-file-key="${escapeAttr(key)}" data-file-idx="${fi}">
          <div class="cpp-problems-file-bar">
            <button type="button" class="cpp-problems-file-header" aria-expanded="${!isCollapsed}">
              <span class="cpp-problems-twist${isCollapsed ? ' is-collapsed' : ''}" aria-hidden="true"></span>
              <span class="cpp-problems-file-icon" aria-hidden="true"></span>
              <span class="cpp-problems-file-name" title="${escapeAttr(pathLabel)}">${escapeHtml(pathLabel)}</span>
              <span class="cpp-problems-file-counts">
                ${errN ? `<span class="cpp-prob-pill cpp-prob-error">${errN}</span>` : ''}
                ${warnN ? `<span class="cpp-prob-pill cpp-prob-warning">${warnN}</span>` : ''}
                ${infoN ? `<span class="cpp-prob-pill cpp-prob-info">${infoN}</span>` : ''}
              </span>
            </button>
            <button type="button" class="cpp-prob-copy-btn cpp-prob-copy-file" title="Copy this file's problems" aria-label="Copy section" data-file-idx="${fi}">
              ${COPY_SVG}
            </button>
          </div>
          <div class="cpp-problems-list"${isCollapsed ? ' hidden' : ''}>
      `;

      file.problems.forEach((p, pi) => {
        const line = (p.row | 0) + 1;
        const col = (p.column | 0) + 1;
        html += `
          <div class="cpp-problems-item ${typeClass(p.type)}"
            data-uri="${escapeAttr(file.fileUri || '')}"
            data-name="${escapeAttr(file.fileName || '')}"
            data-row="${p.row | 0}"
            data-col="${p.column | 0}"
            data-file-idx="${fi}"
            data-prob-idx="${pi}">
            <button type="button" class="cpp-problems-item-goto" title="Go to problem">
              <span class="cpp-problems-item-marker ${typeClass(p.type)}" aria-hidden="true"></span>
              <span class="cpp-problems-item-msg user-select-text">${escapeHtml(p.text)}</span>
              <span class="cpp-problems-item-loc">:${line}:${col}</span>
            </button>
            <button type="button" class="cpp-prob-copy-btn cpp-prob-copy-one" title="Copy this problem" aria-label="Copy problem" data-file-idx="${fi}" data-prob-idx="${pi}">
              ${COPY_SVG}
            </button>
          </div>
        `;
      });

      html += `</div></div>`;
    });

    html += `</div>`;
  }

  html += `</div>`;
  pageBody.innerHTML = html;

  // Copy all
  pageBody.querySelector('.cpp-prob-copy-all')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    copyText(formatAllProblems(files), 'All problems copied');
  });

  // Copy file section
  pageBody.querySelectorAll('.cpp-prob-copy-file').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const fi = parseInt(btn.getAttribute('data-file-idx') || '-1', 10);
      const file = files[fi];
      if (!file) return;
      copyText(formatFileSection(file), 'Section copied');
    });
  });

  // Copy single problem
  pageBody.querySelectorAll('.cpp-prob-copy-one').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const fi = parseInt(btn.getAttribute('data-file-idx') || '-1', 10);
      const pi = parseInt(btn.getAttribute('data-prob-idx') || '-1', 10);
      const file = files[fi];
      const p = file?.problems?.[pi];
      if (!file || !p) return;
      copyText(formatOneProblem(file, p), 'Problem copied');
    });
  });

  // Collapse / expand file groups
  pageBody.querySelectorAll('.cpp-problems-file-header').forEach(hdr => {
    hdr.addEventListener('click', e => {
      e.preventDefault();
      const group = hdr.closest('.cpp-problems-file');
      if (!group) return;
      const key = group.getAttribute('data-file-key') || '';
      const list = group.querySelector('.cpp-problems-list');
      const twist = group.querySelector('.cpp-problems-twist');
      const nowCollapsed = !group.classList.contains('is-collapsed');

      group.classList.toggle('is-collapsed', nowCollapsed);
      if (twist) twist.classList.toggle('is-collapsed', nowCollapsed);
      if (list) {
        if (nowCollapsed) list.setAttribute('hidden', '');
        else list.removeAttribute('hidden');
      }
      hdr.setAttribute('aria-expanded', String(!nowCollapsed));

      if (key) {
        if (nowCollapsed) collapsedFiles.add(key);
        else collapsedFiles.delete(key);
      }
    });
  });

  // Go to problem (message area only — text stays selectable)
  pageBody.querySelectorAll('.cpp-problems-item-goto').forEach(btn => {
    btn.addEventListener('click', e => {
      // If user is selecting text, don't navigate
      const sel = window.getSelection?.();
      if (sel && String(sel).length > 0) return;
      const row = btn.closest('.cpp-problems-item');
      if (!row) return;
      const uri = row.getAttribute('data-uri') || '';
      const name = row.getAttribute('data-name') || '';
      const r = parseInt(row.getAttribute('data-row') || '0', 10);
      const c = parseInt(row.getAttribute('data-col') || '0', 10);
      goToProblem(uri, name, r, c);
    });
  });
}

function hideProblemsPage() {
  if (!problemsPage) return;
  try { problemsPage.hide(); } catch (_) {}
  try {
    if (actionStack?.has?.(PAGE_STACK_ID)) actionStack.remove(PAGE_STACK_ID);
  } catch (_) {}
  // Remove from DOM if still attached
  try {
    if (problemsPage.parentElement) problemsPage.parentElement.removeChild(problemsPage);
  } catch (_) {}
}

/**
 * Acode Page has no built-in show() — must implement (docs).
 * Pattern: actionStack.push + app.append(page)
 */
function ensurePage() {
  if (problemsPage) return problemsPage;

  const backBtn = tag('span', {
    className: 'icon arrow_back',
    dataset: { action: 'back' }
  });
  backBtn.onclick = () => hideProblemsPage();

  problemsPage = Page('C/C++ Problems', { lead: backBtn });
  pageBody = tag('div', { className: 'cpp-problems-body' });
  problemsPage.appendBody(pageBody);

  problemsPage.show = function showProblemsPage() {
    try {
      // Avoid duplicate stack entries
      if (actionStack?.has?.(PAGE_STACK_ID)) {
        actionStack.remove(PAGE_STACK_ID);
      }
      actionStack.push({
        id: PAGE_STACK_ID,
        action: () => hideProblemsPage()
      });
    } catch (e) {
      console.warn('[Problems] actionStack push failed:', e);
    }
    renderPageContent();
    try {
      // Prefer global app container (standard Acode pattern)
      if (typeof app !== 'undefined' && app.append) {
        app.append(problemsPage);
      } else if (document.body) {
        document.body.appendChild(problemsPage);
      }
    } catch (e) {
      console.error('[Problems] append page failed:', e);
      toast('Could not open Problems page');
    }
  };

  return problemsPage;
}

function openProblemsPage() {
  ensurePage();
  if (typeof problemsPage.show === 'function') {
    problemsPage.show();
  } else {
    console.error('[Problems] show is still missing');
    toast('Problems page error');
  }
}

/**
 * Live label like "2E 0W" (same idea as pydbg problemsPage).
 */
function computeButtonText() {
  const { summary } = getAllProblems();
  const e = Number(summary?.errors) || 0;
  const w = Number(summary?.warnings) || 0;
  return `${e}E ${w}W`;
}

function hasAnyProblems() {
  const { summary } = getAllProblems();
  return (Number(summary.errors) || 0) + (Number(summary.warnings) || 0) > 0;
}

/** Mutate DOM text nodes on Acode side-button (pydbg pattern) */
function applyTextToSideButtonDom(el, text) {
  if (!el) return false;
  let applied = false;
  const nodes = el.querySelectorAll(
    '.text, .label, .side-button-text, [class*="text"], span, small'
  );
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.classList && n.classList.contains('icon')) continue;
    if (n.children && n.children.length && n.querySelector('.icon')) continue;
    n.textContent = text;
    applied = true;
  }
  if (!applied) {
    el.setAttribute('aria-label', text);
    el.title = text;
    for (const child of [...el.childNodes]) {
      if (child.nodeType === 3 && child.textContent.trim()) {
        child.textContent = text;
        applied = true;
      }
    }
  }
  return applied;
}

function sideButtonOpts(text) {
  return {
    text,
    icon: 'report_problem',
    backgroundColor: 'var(--primary-color, #1e1e1e)',
    textColor: 'var(--primary-text-color, #fff)',
    onclick() {
      openProblemsPage();
    }
  };
}

function ensureSideButton() {
  if (sideButton) return sideButton;
  try {
    sideButton = SideButton(sideButtonOpts(computeButtonText()));
  } catch (e) {
    console.warn('[Problems] SideButton failed', e);
  }
  return sideButton;
}

/**
 * Acode often cannot mutate side-button label in place — recreate (pydbg).
 */
function recreateSideButton(text) {
  const settings = getSettings();
  const shouldShow =
    settings.showProblemsSideButton !== false &&
    isCppFile(editorManager?.activeFile) &&
    hasAnyProblems();
  try {
    sideButton?.hide?.();
  } catch (_) {}
  sideButton = null;
  try {
    sideButton = SideButton(sideButtonOpts(text));
    if (shouldShow) sideButton.show();
    else sideButton.hide();
  } catch (e) {
    console.warn('[Problems] recreate SideButton', e);
  }
}

function updateSideButtonBadge() {
  ensureSideButton();
  if (!sideButton) return;
  const text = computeButtonText();
  try {
    if (typeof sideButton.setText === 'function') sideButton.setText(text);
    if (sideButton.text !== undefined) sideButton.text = text;
    if (sideButton.$text) sideButton.$text.textContent = text;

    let ok = false;
    if (sideButton.$el) ok = applyTextToSideButtonDom(sideButton.$el, text);
    if (!ok && sideButton.el) ok = applyTextToSideButtonDom(sideButton.el, text);
    if (!ok && sideButton.root) ok = applyTextToSideButtonDom(sideButton.root, text);

    const probe =
      sideButton.$el?.textContent ||
      sideButton.el?.textContent ||
      '';
    // Stuck on old label → recreate so live counts actually show
    if (!ok || (probe && !probe.includes(text.split(' ')[0]) && text !== probe.trim())) {
      recreateSideButton(text);
    }
  } catch (e) {
    console.warn('[Problems] badge update', e);
    try {
      recreateSideButton(text);
    } catch (_) {}
  }
  refreshSideButtonVisibility();
}

/**
 * Show only when: setting on + C/C++ tab + at least 1 E/W.
 */
function refreshSideButtonVisibility() {
  if (!sideButton) return;
  const settings = getSettings();
  const enabled = settings.showProblemsSideButton !== false;
  const cpp = isCppFile(editorManager.activeFile);
  const show = enabled && cpp && hasAnyProblems();
  try {
    if (show) sideButton.show();
    else sideButton.hide();
  } catch (_) {}
}

export function initProblemsUI() {
  ensureSideButton();
  try {
    sideButton?.hide?.();
  } catch (_) {}
  updateSideButtonBadge();

  if (!fileSwitchHandler) {
    fileSwitchHandler = () => updateSideButtonBadge();
    editorManager.on('switch-file', fileSwitchHandler);
    editorManager.on('rename-file', fileSwitchHandler);
  }

  if (!unsubscribe) {
    unsubscribe = subscribe(() => {
      updateSideButtonBadge();
      try {
        if (pageBody && pageBody.isConnected) renderPageContent();
      } catch (_) {}
    });
  }
}

export function setProblemsSideButtonVisible(visible) {
  const settings = getSettings();
  settings.showProblemsSideButton = !!visible;
  if (!sideButton) {
    if (visible) initProblemsUI();
    else return;
  }
  refreshSideButtonVisibility();
}

export function destroyProblemsUI() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (fileSwitchHandler) {
    try {
      editorManager.off('switch-file', fileSwitchHandler);
      editorManager.off('rename-file', fileSwitchHandler);
    } catch (_) {}
    fileSwitchHandler = null;
  }
  hideProblemsPage();
  if (sideButton) {
    try { sideButton.hide(); } catch (_) {}
    sideButton = null;
  }
  problemsPage = null;
  pageBody = null;
}

export function openProblemsPagePublic() {
  openProblemsPage();
}

/** Call from initPlugin checkFileAndSetup if needed */
export function onActiveFileChanged() {
  refreshSideButtonVisibility();
}
