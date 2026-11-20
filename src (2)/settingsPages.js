/**
 * settingsPages.js — Category hub + sub-pages (Python-tools style)
 */
import { defaultSettings } from './settingsDefaults.js';

const Page = acode.require('page');
const actionStack = acode.require('actionStack');
const select = acode.require('select');
const prompt = acode.require('prompt');
const toast = acode.require('toast');

const PLUGIN_ID = 'acode.plugin.cpp'; // must match plugin.json id — adjusted in settings.js export
const PAGE_STACK_PREFIX = 'cpp-tools-settings-';

/** Set by settings.js after plugin id known */
let resolvedPluginId = null;

export function setPluginId(id) {
  resolvedPluginId = id;
}

function pluginId() {
  return resolvedPluginId || PLUGIN_ID;
}

/** @type {HTMLElement|null} */
let activePage = null;
/** @type {string|null} */
let activeStackId = null;
/** @type {HTMLElement|null} */
let activeBody = null;
/** @type {() => object[]} */
let activeListFn = null;

function store() {
  return acode.require('settings');
}

function getSettings() {
  const appSettings = store();
  const id = pluginId();
  let value = appSettings.value[id];
  if (!value || typeof value !== 'object') {
    value = { ...defaultSettings };
    appSettings.value[id] = value;
  }
  return value;
}

function updateSetting(key, val) {
  const appSettings = store();
  const id = pluginId();
  if (!appSettings.value[id]) {
    appSettings.value[id] = { ...defaultSettings };
  }
  appSettings.value[id][key] = val;
  appSettings.update();
}

function val(key) {
  const s = getSettings();
  return s[key] !== undefined ? s[key] : defaultSettings[key];
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayValue(item) {
  const s = getSettings();
  if (item.checkbox) return !!s[item.key];
  if (item.select) {
    const cur = s[item.key] !== undefined ? s[item.key] : item.value;
    const opt = (item.select || []).find((o) => (Array.isArray(o) ? o[0] : o.value) === cur);
    if (!opt) return String(cur ?? '');
    return Array.isArray(opt) ? opt[1] : opt.text || opt.value;
  }
  const v = s[item.key] !== undefined ? s[item.key] : item.value;
  return v === '' || v == null ? '' : String(v);
}

function subCb(key, value) {
  updateSetting(key, value);
  if (activeBody && activeListFn) renderList(activeBody, activeListFn());
  try {
    window.dispatchEvent(new CustomEvent('cpp-tools-settings', { detail: { key, value } }));
  } catch (_) {}
}

function renderList(body, list) {
  const s = getSettings();
  let html = '<section class="settings-section"><div class="settings-section-card">';
  for (const item of list) {
    const key = item.key;
    const isCheck = !!item.checkbox;
    const isSelect = !!(item.select && Array.isArray(item.select));
    const isCat = typeof key === 'string' && key.startsWith('__cat_');
    const isAction = !!item.actionOnly;
    const checked = isCheck && !!s[key];
    const info = item.info
      ? `<small class="value setting-info">${escapeHtml(item.info)}</small>`
      : '';

    let classes = 'list-item no-leading-icon';
    if (item.info) classes += ' has-subtitle';
    if (isCheck) {
      /* switch only */
    } else if (isSelect) {
      classes += ' has-tail-value has-tail-select';
    } else {
      classes += ' has-tail-value';
    }

    let tail = '';
    if (isCheck) {
      tail = `<div class="setting-tail">
        <label class="input-checkbox switch">
          <input type="checkbox" data-key="${escapeHtml(key)}"${checked ? ' checked' : ''}>
          <span class="box" style="height: 1rem; width: 1rem;"><span class="handle"></span></span>
          <span></span>
        </label>
      </div>`;
    } else if (isSelect) {
      tail = `<div class="setting-tail">
        <div class="setting-value-display is-select">
          <small class="setting-trailing-value is-select">${escapeHtml(displayValue(item))}</small>
          <span class="icon keyboard_arrow_down setting-value-icon"></span>
        </div>
      </div>`;
    } else if (isCat || isAction) {
      tail = `<div class="setting-tail">
        <span class="icon keyboard_arrow_right settings-chevron"></span>
      </div>`;
    } else {
      tail = `<div class="setting-tail">
        <div class="setting-value-display">
          <small class="setting-trailing-value">${escapeHtml(displayValue(item))}</small>
        </div>
        <span class="icon keyboard_arrow_right settings-chevron"></span>
      </div>`;
    }

    const dataType = isCheck
      ? 'check'
      : isSelect
        ? 'select'
        : isCat
          ? 'cat'
          : isAction
            ? 'action'
            : 'prompt';

    html += `
      <div tabindex="1" data-key="${escapeHtml(key)}" data-type="${dataType}" data-action="list-item"
        class="${classes}" role="button">
        <span class="icon no-icon"></span>
        <div class="container">
          <div class="text">${escapeHtml(item.text || key)}</div>
          ${info}
        </div>
        ${tail}
      </div>`;
  }
  html += '</div></section>';
  body.innerHTML = html;

  body.querySelectorAll('.list-item[data-action="list-item"]').forEach((row) => {
    row.addEventListener('click', async (e) => {
      const key = row.getAttribute('data-key');
      const type = row.getAttribute('data-type');
      const item = list.find((x) => x.key === key);
      if (!item) return;

      if (type === 'check') {
        if (e.target.closest('label.input-checkbox')) return;
        if (e.target.matches('input[type="checkbox"]')) return;
        const input = row.querySelector('input[type="checkbox"]');
        if (input) {
          input.checked = !input.checked;
          subCb(key, !!input.checked);
        }
        return;
      }

      if (type === 'cat') {
        openCategory(key);
        return;
      }

      if (item.actionOnly && typeof item.onAction === 'function') {
        item.onAction();
        return;
      }

      if (type === 'select' && item.select) {
        const choice = await select(item.text || key, item.select, {
          hideOnSelect: true,
          default: val(key),
        });
        if (choice != null) subCb(key, choice);
        return;
      }

      if (item.promptType || item.prompt) {
        const cur = val(key);
        const result = await prompt(
          item.prompt || item.text || key,
          cur == null ? '' : String(cur),
          item.promptType === 'number'
            ? 'number'
            : item.promptType === 'textarea'
              ? 'textarea'
              : 'text'
        );
        if (result != null) subCb(key, result);
      }
    });
  });

  body.querySelectorAll('label.input-checkbox input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      e.stopPropagation();
      const key = input.getAttribute('data-key');
      subCb(key, !!input.checked);
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  });
}

function openPage(title, listFn, stackId) {
  const back = tag('span', { className: 'icon arrow_back', dataset: { action: 'back' } });
  const page = Page(title, { lead: back });
  const body = tag('div', {
    className: 'main cpp-tools-settings-body',
    style: 'overflow:auto;height:100%',
  });
  page.appendBody(body);

  const close = () => {
    try {
      page.hide?.();
      page.parentElement?.removeChild(page);
    } catch (_) {}
    try {
      actionStack.remove(stackId);
    } catch (_) {}
    if (activeStackId === stackId) {
      activePage = null;
      activeStackId = null;
      activeBody = null;
      activeListFn = null;
    }
  };

  back.onclick = close;
  actionStack.push({ id: stackId, action: close });

  activePage = page;
  activeStackId = stackId;
  activeBody = body;
  activeListFn = listFn;
  renderList(body, listFn());

  if (typeof app !== 'undefined' && app.append) app.append(page);
  else document.body.appendChild(page);
}

export function openCategory(catKey) {
  const map = {
    __cat_runner: { title: 'Runner', list: runnerList },
    __cat_input: { title: 'Input chips', list: inputList },
    __cat_linter: { title: 'Linter & errors', list: linterList },
    __cat_lsp: { title: 'LSP (Clangd)', list: lspList },
    __cat_compiler: { title: 'Compiler', list: compilerList },
    __cat_formatter: { title: 'Formatter', list: formatterList },
    __cat_completion: { title: 'Completion & snippets', list: completionList },
    __cat_deps: { title: 'Dependencies', list: depsList },
  };
  const entry = map[catKey];
  if (!entry) return;
  openPage(entry.title, entry.list, PAGE_STACK_PREFIX + catKey);
}

// ── Category lists ──────────────────────────────────────────

export function hubList() {
  return [
    {
      key: 'pluginEnabled',
      text: 'Enable C/C++ Plugin',
      checkbox: true,
      info: 'Master switch for all features',
    },
    { key: '__cat_runner', text: 'Runner', value: '›', info: 'Run mode, terminal, popup, inline' },
    { key: '__cat_input', text: 'Input chips & loops', value: '›', info: 'stdin chips, loop rounds, fflush fix' },
    { key: '__cat_linter', text: 'Linter & errors', value: '›' },
    { key: '__cat_lsp', text: 'LSP (Clangd)', value: '›' },
    { key: '__cat_compiler', text: 'Compiler standards', value: '›' },
    { key: '__cat_formatter', text: 'Formatter', value: '›' },
    { key: '__cat_completion', text: 'Completion & snippets', value: '›' },
    { key: '__cat_deps', text: 'Dependencies', value: '›' },
  ];
}

function runnerList() {
  return [
    {
      key: 'runMode',
      text: 'Default run mode',
      value: val('runMode'),
      select: [
        ['ask', 'Always ask when clicking Run'],
        ['terminal', 'Run in terminal'],
        ['popup', 'Run in popup'],
        ['inline', 'Run inline'],
      ],
      info: 'Inline input = inline logs + chip stdin (blocks if inputs missing)',
    },
    {
      key: 'runInClearScreen',
      text: 'Clear terminal on run',
      checkbox: true,
    },
    {
      key: 'terminalShellPrefix',
      text: 'Terminal: shell before compile',
      value: val('terminalShellPrefix') || '(none)',
      promptType: 'textarea',
      info: 'Optional shell lines run before gcc/g++ (exports, cd, …)',
    },
    {
      key: 'runArgs',
      text: 'Program run arguments',
      value: val('runArgs') || '(none)',
      promptType: 'text',
      info: 'Appended after the binary in terminal/popup/inline',
    },
    {
      key: 'enableInlineRunLogs',
      text: 'Show inline run logs',
      checkbox: true,
      info: 'Inline mode only — program output near printf/cout (no meta)',
    },
    {
      key: 'feedChipsInTerminal',
      text: 'Feed chip values in terminal mode',
      checkbox: true,
      info: 'When off, terminal stays fully interactive',
    },
    // ── Terminal extras ──
    {
      key: 'termShowCompileInfo',
      text: 'Terminal: show [compile] line',
      checkbox: true,
    },
    {
      key: 'termShowFilePath',
      text: 'Terminal: show [file] path',
      checkbox: true,
    },
    {
      key: 'termShowCommand',
      text: 'Terminal: show [cmd] gcc line',
      checkbox: true,
    },
    {
      key: 'termShowRunBanner',
      text: 'Terminal: show [run] banner',
      checkbox: true,
    },
    {
      key: 'termShowTiming',
      text: 'Terminal: show execution time',
      checkbox: true,
    },
    {
      key: 'termShowExitCode',
      text: 'Terminal: show exit code',
      checkbox: true,
    },
    // ── Popup extras ──
    {
      key: 'popupShowCompileInfo',
      text: 'Popup: show [compile] line',
      checkbox: true,
    },
    {
      key: 'popupShowFilePath',
      text: 'Popup: show [file] path',
      checkbox: true,
    },
    {
      key: 'popupShowCommand',
      text: 'Popup: show [cmd] gcc line',
      checkbox: true,
    },
    {
      key: 'popupShowRunBanner',
      text: 'Popup: show [run] banner',
      checkbox: true,
    },
    {
      key: 'popupShowTiming',
      text: 'Popup: show execution time',
      checkbox: true,
    },
    {
      key: 'popupShowExitCode',
      text: 'Popup: show exit code',
      checkbox: true,
    },
  ];
}

function inputList() {
  return [
    {
      key: 'enableInputChips',
      text: 'Enable input chips',
      checkbox: true,
      info: 'Chips on scanf/cin/fgets — sequential prompts with &name + datatype',
    },
    {
      key: 'clearInputOnType',
      text: 'Clear input on type',
      checkbox: true,
      info: 'When you edit the file, clear stored chip values (chips reset to empty)',
    },
    {
      key: 'maxLoopInputs',
      text: 'Max inputs in loop',
      value: val('maxLoopInputs'),
      promptType: 'number',
      info: 'Max rounds when input is inside for/while (default 100). Caps infinite loops.',
    },
    {
      key: 'chipPreviewValues',
      text: 'Chip preview value count',
      value: val('chipPreviewValues'),
      promptType: 'number',
      info: 'How many values to show on the chip label (default 5, max 10). Extra → …',
    },
    {
      key: 'blockRunWithoutInputs',
      text: 'Block popup/inline if inputs missing',
      checkbox: true,
      info: 'Popup/inline/inline-input won’t run until chips are filled (terminal always OK)',
    },
    {
      key: 'autoBufferFix',
      text: 'Auto buffer fix (fflush)',
      checkbox: true,
      info: 'Inject fflush(stdout) after prompts before scanf/cin — fixes delayed printf',
    },
  ];
}

function linterList() {
  return [
    {
      key: 'enableLinter',
      text: 'Error UI mode',
      value: val('enableLinter'),
      select: [
        ['disable', 'Disable Linter'],
        ['linter', 'Gutter & Underline'],
        ['inline', 'Inline Floating Errors'],
        ['both', 'Both Linter & Inline'],
      ],
    },
    {
      key: 'errorTrigger',
      text: 'Error update trigger',
      value: val('errorTrigger'),
      select: [
        ['onKeypress', 'On Keypress (Live)'],
        ['onSave', 'On File Save'],
      ],
    },
    {
      key: 'showProblemsSideButton',
      text: 'Show Problems side button',
      checkbox: true,
    },
  ];
}

function lspList() {
  return [
    {
      key: 'clangdArgs',
      text: 'Clangd arguments',
      value: val('clangdArgs'),
      prompt: 'Enter Clangd Arguments',
      promptType: 'text',
    },
    { key: 'enableLspCompletion', text: 'LSP smart completion', checkbox: true },
    { key: 'enableHover', text: 'Hover documentation', checkbox: true },
    { key: 'enableGoToDefinition', text: 'Go to definition', checkbox: true },
    { key: 'enableInlayHints', text: 'Inlay hints (CM6)', checkbox: true },
  ];
}

function compilerList() {
  return [
    {
      key: 'cStandard',
      text: 'C standard (-std)',
      value: val('cStandard'),
      select: [
        ['c89', 'C89'],
        ['c99', 'C99'],
        ['c11', 'C11'],
        ['gnu11', 'GNU11'],
      ],
    },
    {
      key: 'cppStandard',
      text: 'C++ standard (-std)',
      value: val('cppStandard'),
      select: [
        ['c++11', 'C++11'],
        ['c++14', 'C++14'],
        ['c++17', 'C++17'],
        ['c++20', 'C++20'],
        ['gnu++17', 'GNU++17'],
      ],
    },
    {
      key: 'compilerFlags',
      text: 'Extra compiler flags',
      value: val('compilerFlags'),
      prompt: 'Enter Extra Flags',
      promptType: 'text',
    },
  ];
}

function formatterList() {
  return [
    { key: 'formatOnSave', text: 'Format on save', checkbox: true },
    {
      key: 'clangFormatStyle',
      text: 'Formatter style preset',
      value: val('clangFormatStyle'),
      select: [
        ['Google', 'Google'],
        ['LLVM', 'LLVM'],
        ['Mozilla', 'Mozilla'],
        ['WebKit', 'WebKit'],
      ],
    },
    {
      key: 'clangFormatCustom',
      text: 'Custom format style',
      value: val('clangFormatCustom'),
      prompt: 'Custom clang-format JSON/YAML',
      promptType: 'textarea',
    },
  ];
}

function completionList() {
  return [
    { key: 'enableSnippets', text: 'Built-in snippets', checkbox: true },
    { key: 'enableKeywords', text: 'Keywords', checkbox: true },
    { key: 'enableIdentifiers', text: 'Identifiers from file', checkbox: true },
    { key: 'enableCustomSnippets', text: 'Custom snippets', checkbox: true },
    {
      key: 'enableTreeSitterAnalysis',
      text: 'Tree-sitter analysis',
      checkbox: true,
    },
    {
      key: 'autoImportTrigger',
      text: 'Auto-import trigger',
      value: val('autoImportTrigger'),
      select: [
        ['onKeypress', 'On Keypress'],
        ['onSave', 'On Save'],
      ],
    },
  ];
}

function depsList() {
  return [
    {
      key: '__deps_check',
      text: 'Check dependencies',
      actionOnly: true,
      info: 'Verify gcc / g++ / clangd',
      onAction: () => {
        import('./dependencyChecker.js')
          .then((m) => m.checkDependenciesAction())
          .catch(console.error);
      },
    },
    {
      key: '__deps_reinstall',
      text: 'Reinstall dependencies',
      actionOnly: true,
      onAction: () => {
        import('./dependencyChecker.js')
          .then((m) => m.reinstallDependenciesAction())
          .catch(console.error);
      },
    },
    {
      key: '__deps_uninstall',
      text: 'Uninstall dependencies',
      actionOnly: true,
      onAction: () => {
        import('./dependencyChecker.js')
          .then((m) => m.uninstallDependenciesAction())
          .catch(console.error);
      },
    },
  ];
}
