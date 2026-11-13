// src/libraries/libraryPage.js
// "Libraries" page: browse, install, remove and use C/C++ libraries (Alpine apk).
// All host objects are injected (Page, actionStack, toast, …) so the page is testable and
// the module has no top-level dependency on `acode`.

import { CATEGORIES, LIBRARIES, detectLibraries, searchLibraries } from './catalog.js';

const STACK_ID = 'cpp-libraries-page';

function h(tagName, props = {}, ...children) {
  const el = document.createElement(tagName);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  search: '<path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"/>',
  close: '<path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
  check: '<path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  refresh: '<path fill="currentColor" d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/>',
  copy: '<path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m0 16H8V7h11z"/>',
  plus: '<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>',
  trash: '<path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/>',
  chevron: '<path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>',
  warn: '<path fill="currentColor" d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/>',
};

function icon(name, size = 18) {
  const span = h('span', { class: 'cpp-lib-ico', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}">${ICONS[name]}</svg>`;
  return span;
}

function initials(name) {
  const words = String(name).replace(/[^A-Za-z0-9+ ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function autoLinkText(lib) {
  if (lib.headerOnly && !lib.pc) return 'Header-only — nothing to link';
  if (lib.pc && lib.pc.length) return `pkg-config ${lib.pc.join(' ')}`;
  return lib.ldflags || 'automatic';
}

/**
 * @param {object} deps
 * @param {Function} deps.Page            Acode Page factory
 * @param {object}   deps.actionStack     Acode actionStack (back button)
 * @param {object}   deps.manager         createLibManager() instance
 * @param {(msg: string, ms?: number) => void} deps.toast
 * @param {(title: string, msg: string) => Promise<boolean>} deps.confirm
 * @param {(text: string) => Promise<boolean>|boolean} deps.copy
 * @param {() => ({ text: string, fileName: string, localFiles: string[] } | null)} deps.getActiveSource
 * @param {(line: string) => ('inserted'|'exists'|'no-editor')} deps.insertInclude
 * @param {HTMLElement} [deps.mount]      where to append the page (default: document.body)
 */
export function createLibraryPage(deps) {
  const { Page, actionStack, manager, toast, confirm, copy, getActiveSource, insertInclude } = deps;

  const ui = {
    page: null,
    body: null,
    root: null,
    input: null,
    chips: null,
    summary: null,
    need: null,
    banner: null,
    list: null,
    alpine: null,
    query: '',
    cat: 'all',
    open: new Set(),
    done: new Set(), // ids that just finished (pop animation, once)
    showDetails: new Set(),
    alpineState: null, // { query, loading, items, error }
    unsub: null,
    timer: 0,
    isOpen: false,
  };

  /* ------------------------------------------------------------ actions */

  async function doInstall(lib) {
    const res = await manager.install(lib);
    if (res.ok) {
      ui.done.add(lib.id);
      renderList(); // the manager already re-rendered; replay once with the pop animation
      try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
      toast(`${lib.name} installed — ready to ${lib.include.split('\n').pop()}`, 2600);
    } else {
      toast(`${lib.name}: install failed`, 2200);
    }
  }

  async function doRemove(lib) {
    const ok = await confirm(`Remove ${lib.name}?`, `This uninstalls ${lib.apk.join(', ')} from the C/C++ environment.`);
    if (!ok) return;
    const res = await manager.remove(lib);
    toast(res.ok ? `${lib.name} removed` : `${lib.name}: remove failed`, 2000);
  }

  function doInsert(lib) {
    const r = insertInclude(lib.include);
    if (r === 'inserted') toast('Include added to the top of your file', 1800);
    else if (r === 'exists') toast('Already included in this file', 1600);
    else toast('Open a C/C++ file first', 1600);
  }

  async function doCopy(lib) {
    try {
      await copy(lib.include);
      toast('Copied', 900);
    } catch (_) {
      toast('Could not copy', 1200);
    }
  }

  async function installAllNeeded(libs) {
    for (const lib of libs) {
      if (manager.isInstalled(lib.id) || manager.isBusy(lib.id)) continue;
      doInstall(lib); // queued sequentially by the manager
    }
  }

  async function runAlpineSearch(query) {
    ui.alpineState = { query, loading: true, items: [], error: '' };
    renderAlpine();
    try {
      const items = await manager.searchAlpine(query);
      ui.alpineState = { query, loading: false, items, error: '' };
    } catch (e) {
      ui.alpineState = { query, loading: false, items: [], error: String(e?.message || e) };
    }
    renderAlpine();
  }

  /* ---------------------------------------------------------- rendering */

  function visibleLibraries() {
    let list = searchLibraries(ui.query, LIBRARIES);
    if (ui.cat === 'installed') list = list.filter((l) => manager.isInstalled(l.id));
    else if (ui.cat !== 'all') list = list.filter((l) => l.cat === ui.cat);
    return list;
  }

  function renderChips() {
    ui.chips.textContent = '';
    const installedCount = LIBRARIES.filter((l) => manager.isInstalled(l.id)).length;
    for (const c of CATEGORIES) {
      const active = ui.cat === c.id;
      const chip = h(
        'button',
        {
          type: 'button',
          class: 'cpp-lib-chip' + (active ? ' is-active' : ''),
          'aria-pressed': String(active),
          onclick: () => {
            ui.cat = c.id;
            renderChips();
            renderList();
          },
        },
        c.label,
        c.id === 'installed' && installedCount ? h('span', { class: 'cpp-lib-chip-n', text: String(installedCount) }) : null,
      );
      ui.chips.append(chip);
    }
  }

  function renderBanner() {
    ui.banner.textContent = '';
    const s = manager.state;
    if (s.scanned && s.apk === false) {
      ui.banner.append(
        h(
          'div',
          { class: 'cpp-lib-note is-warn', role: 'alert' },
          icon('warn'),
          h('div', {}, h('b', { text: 'Package manager not found' }), h('div', { text: 'Libraries are installed with Alpine’s apk. Set up the C/C++ environment first (Tools → Dependencies).' })),
        ),
      );
    }
  }

  function renderNeed() {
    ui.need.textContent = '';
    const src = getActiveSource && getActiveSource();
    if (!src || !manager.state.scanned) return;
    const used = detectLibraries([src.text], { localFiles: src.localFiles }).map((d) => d.lib);
    const missing = used.filter((l) => !manager.isInstalled(l.id));
    if (!missing.length) return;
    const card = h(
      'div',
      { class: 'cpp-lib-need-card' },
      h('div', { class: 'cpp-lib-need-head' }, icon('warn', 16), h('span', { text: `Used in ${src.fileName || 'this file'} — not installed` })),
      h(
        'div',
        { class: 'cpp-lib-need-list' },
        missing.map((l) => {
          const busy = manager.isBusy(l.id);
          return h(
            'button',
            {
              type: 'button',
              class: 'cpp-lib-need-item',
              disabled: !!busy,
              onclick: () => doInstall(l),
            },
            h('span', { class: 'cpp-lib-need-name', text: l.name }),
            h('span', { class: 'cpp-lib-need-act', text: busy ? (busy.phase === 'queued' ? 'Queued' : 'Installing…') : 'Install' }),
          );
        }),
      ),
      missing.length > 1
        ? h('button', { type: 'button', class: 'cpp-lib-btn is-primary cpp-lib-need-all', onclick: () => installAllNeeded(missing), text: `Install all (${missing.length})` })
        : null,
    );
    ui.need.append(card);
  }

  function renderSummary() {
    const s = manager.state;
    const total = LIBRARIES.length;
    const inst = LIBRARIES.filter((l) => manager.isInstalled(l.id)).length;
    ui.summary.textContent = '';
    ui.summary.append(
      h('span', { class: 'cpp-lib-summary-text' }, s.scanned ? h('b', { text: String(inst) }) : '…', ` installed · ${total} libraries`),
      h(
        'button',
        {
          type: 'button',
          class: 'cpp-lib-iconbtn',
          title: 'Refresh',
          'aria-label': 'Refresh installed libraries',
          onclick: () => refresh(true),
        },
        icon('refresh'),
      ),
    );
  }

  function skeleton() {
    return Array.from({ length: 5 }, () =>
      h('div', { class: 'cpp-lib-card is-skeleton', 'aria-hidden': 'true' },
        h('div', { class: 'cpp-lib-card-main' },
          h('div', { class: 'cpp-lib-avatar' }),
          h('div', { class: 'cpp-lib-info' }, h('div', { class: 'cpp-lib-sk-line w60' }), h('div', { class: 'cpp-lib-sk-line w90' })),
        )),
    );
  }

  function actionButton(lib, installed, busy) {
    if (busy) {
      return h('button', { type: 'button', class: 'cpp-lib-btn is-busy', disabled: true },
        h('span', { class: 'cpp-lib-spinner' }),
        busy.phase === 'queued' ? 'Queued' : busy.op === 'remove' ? 'Removing' : 'Installing');
    }
    if (installed) {
      return h('button', { type: 'button', class: 'cpp-lib-btn is-tonal', onclick: (e) => { e.stopPropagation(); doInsert(lib); }, 'aria-label': `Insert include for ${lib.name}` },
        icon('plus', 16), 'Include');
    }
    return h('button', { type: 'button', class: 'cpp-lib-btn is-primary', onclick: (e) => { e.stopPropagation(); doInstall(lib); }, 'aria-label': `Install ${lib.name}` }, 'Install');
  }

  function renderCard(lib) {
    const installed = manager.isInstalled(lib.id);
    const busy = manager.isBusy(lib.id);
    const err = manager.getError(lib.id);
    const open = ui.open.has(lib.id);
    const popped = ui.done.has(lib.id);
    if (popped) ui.done.delete(lib.id);

    const card = h('div', {
      class: ['cpp-lib-card', `cat-${lib.cat}`, installed ? 'is-installed' : '', busy ? 'is-busy' : '', open ? 'is-open' : '', popped ? 'is-pop' : ''].filter(Boolean).join(' '),
      role: 'listitem',
      dataset: { id: lib.id },
    });

    const toggle = () => {
      if (ui.open.has(lib.id)) ui.open.delete(lib.id);
      else ui.open.add(lib.id);
      card.classList.toggle('is-open', ui.open.has(lib.id));
      head.setAttribute('aria-expanded', String(ui.open.has(lib.id)));
    };

    const head = h(
      'div',
      { class: 'cpp-lib-card-main', role: 'button', tabindex: '0', 'aria-expanded': String(open), onclick: toggle,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } },
      h('div', { class: 'cpp-lib-avatar' }, installed ? icon('check', 20) : initials(lib.name)),
      h(
        'div',
        { class: 'cpp-lib-info' },
        h('div', { class: 'cpp-lib-name' },
          h('span', { text: lib.name }),
          lib.headerOnly ? h('span', { class: 'cpp-lib-badge', text: 'header-only' }) : null,
          lib.display ? h('span', { class: 'cpp-lib-badge is-warn', text: 'needs display' }) : null,
        ),
        h('div', { class: 'cpp-lib-desc', text: lib.desc }),
      ),
      h('div', { class: 'cpp-lib-action' }, actionButton(lib, installed, busy)),
    );
    card.append(head);

    if (busy) {
      card.append(
        h('div', { class: 'cpp-lib-progress', role: 'progressbar', 'aria-label': 'Working' },
          h('div', { class: 'cpp-lib-progress-bar' }),
          h('div', { class: 'cpp-lib-progress-text' },
            h('span', { text: busy.phase === 'queued' ? 'Waiting for the previous task…' : `apk ${busy.op === 'remove' ? 'del' : 'add'} ${lib.apk.join(' ')}` }),
            h('span', { class: 'cpp-lib-elapsed', dataset: { since: String(busy.since) } }),
          )),
      );
    }

    if (err && !busy) {
      const detailsOpen = ui.showDetails.has(lib.id);
      card.append(
        h('div', { class: 'cpp-lib-error', role: 'alert' },
          icon('warn', 16),
          h('div', { class: 'cpp-lib-error-body' },
            h('div', { class: 'cpp-lib-error-msg', text: err.message }),
            detailsOpen ? h('pre', { class: 'cpp-lib-log', text: err.details }) : null,
            h('div', { class: 'cpp-lib-error-actions' },
              h('button', { type: 'button', class: 'cpp-lib-link', onclick: () => doInstall(lib), text: 'Retry' }),
              err.details ? h('button', { type: 'button', class: 'cpp-lib-link', onclick: () => { detailsOpen ? ui.showDetails.delete(lib.id) : ui.showDetails.add(lib.id); renderList(); }, text: detailsOpen ? 'Hide details' : 'Details' }) : null,
              h('button', { type: 'button', class: 'cpp-lib-link', onclick: () => { manager.clearError(lib.id); }, text: 'Dismiss' }),
            ))),
      );
    }

    const lines = lib.include.split('\n');
    card.append(
      h('div', { class: 'cpp-lib-details' },
        h('div', { class: 'cpp-lib-details-inner' },
          h('div', { class: 'cpp-lib-code' },
            h('code', { text: lines.join('\n') }),
            h('div', { class: 'cpp-lib-code-actions' },
              h('button', { type: 'button', class: 'cpp-lib-iconbtn', title: 'Copy', 'aria-label': 'Copy include', onclick: () => doCopy(lib) }, icon('copy', 16)),
              h('button', { type: 'button', class: 'cpp-lib-iconbtn', title: 'Insert into current file', 'aria-label': 'Insert include into current file', onclick: () => doInsert(lib) }, icon('plus', 16)),
            )),
          h('dl', { class: 'cpp-lib-meta' },
            h('dt', { text: 'Package' }), h('dd', { text: lib.apk.join(', ') }),
            h('dt', { text: 'Auto-link' }), h('dd', { text: autoLinkText(lib) }),
          ),
          lib.note ? h('p', { class: 'cpp-lib-hint', text: lib.note }) : null,
          lib.display ? h('p', { class: 'cpp-lib-hint is-warn', text: 'Compiles and links, but windows cannot open inside the Acode terminal.' }) : null,
          h('p', { class: 'cpp-lib-hint', text: 'Once installed, any file that includes this header is built with the right flags automatically (Run and Lint).' }),
          installed && !busy
            ? h('button', { type: 'button', class: 'cpp-lib-btn is-danger', onclick: () => doRemove(lib) }, icon('trash', 16), 'Remove')
            : null,
        )),
    );
    return card;
  }

  function renderList() {
    if (!ui.list) return;
    ui.list.textContent = '';
    if (!manager.state.scanned) {
      ui.list.append(...skeleton());
      return;
    }
    const items = visibleLibraries();
    if (!items.length) {
      ui.list.append(
        h('div', { class: 'cpp-lib-empty' },
          h('div', { class: 'cpp-lib-empty-title', text: ui.query ? `No library matches “${ui.query}”` : 'Nothing here yet' }),
          h('div', { class: 'cpp-lib-empty-sub', text: ui.query ? 'Try searching all Alpine packages below.' : 'Install a library and it shows up here.' }),
        ),
      );
    } else {
      ui.list.append(...items.map(renderCard));
    }
    ensureTimer();
  }

  function renderAlpine() {
    if (!ui.alpine) return;
    ui.alpine.textContent = '';
    const q = ui.query.trim();
    if (q.length < 2 || manager.state.apk === false) return;
    const st = ui.alpineState && ui.alpineState.query === q ? ui.alpineState : null;

    ui.alpine.append(h('div', { class: 'cpp-lib-section', text: 'More packages' }));
    if (!st) {
      ui.alpine.append(
        h('button', { type: 'button', class: 'cpp-lib-searchall', onclick: () => runAlpineSearch(q) },
          icon('search', 18),
          h('span', {}, 'Search all Alpine ', h('code', { text: '-dev' }), ' packages for ', h('b', { text: `“${q}”` })),
        ),
      );
      return;
    }
    if (st.loading) {
      ui.alpine.append(h('div', { class: 'cpp-lib-searching' }, h('span', { class: 'cpp-lib-spinner' }), 'Searching Alpine repositories…'));
      return;
    }
    if (st.error) {
      ui.alpine.append(h('div', { class: 'cpp-lib-note is-warn' }, icon('warn'), h('div', { text: st.error })));
      return;
    }
    if (!st.items.length) {
      ui.alpine.append(h('div', { class: 'cpp-lib-empty-sub', text: 'No matching -dev packages found.' }));
      return;
    }
    const rows = st.items.map((it) => {
      const key = 'pkg:' + it.name;
      const busy = manager.isBusy(key);
      const err = manager.getError(key);
      const installed = manager.state.extra.has(it.name) || it.installed;
      return h('div', { class: 'cpp-lib-row' + (installed ? ' is-installed' : ''), role: 'listitem' },
        h('div', { class: 'cpp-lib-row-main' },
          h('span', { class: 'cpp-lib-row-name', text: it.name }),
          installed ? h('span', { class: 'cpp-lib-badge is-ok', text: 'installed' }) : null,
          err ? h('div', { class: 'cpp-lib-row-err', text: err.message }) : null),
        busy
          ? h('button', { type: 'button', class: 'cpp-lib-btn is-busy', disabled: true }, h('span', { class: 'cpp-lib-spinner' }), busy.phase === 'queued' ? 'Queued' : 'Working')
          : installed
            ? h('button', { type: 'button', class: 'cpp-lib-btn is-tonal', onclick: async () => { if (await confirm(`Remove ${it.name}?`, 'Uninstall this package?')) { await manager.removePackage(it.name); it.installed = false; renderAlpine(); } } }, 'Remove')
            : h('button', { type: 'button', class: 'cpp-lib-btn is-primary', onclick: async () => { const r = await manager.installPackage(it.name); it.installed = r.ok; toast(r.ok ? `${it.name} installed` : `${it.name}: install failed`, 2000); renderAlpine(); } }, 'Install'));
    });
    ui.alpine.append(
      h('div', { class: 'cpp-lib-rows', role: 'list' }, rows),
      h('p', { class: 'cpp-lib-hint', text: 'Headers go to /usr/include. If linking fails, add the library with -l… in Settings → Compiler flags.' }),
    );
  }

  function renderAll() {
    renderBanner();
    renderSummary();
    renderChips();
    renderNeed();
    renderList();
    renderAlpine();
  }

  /* ------------------------------------------------------------- timers */

  function tick() {
    if (!ui.root) return;
    const now = Date.now();
    ui.root.querySelectorAll('.cpp-lib-elapsed').forEach((el) => {
      el.textContent = fmtElapsed(now - Number(el.dataset.since || now));
    });
  }

  function ensureTimer() {
    const anyBusy = manager.state.busy.size > 0;
    if (anyBusy && !ui.timer) ui.timer = setInterval(tick, 1000);
    if (!anyBusy && ui.timer) {
      clearInterval(ui.timer);
      ui.timer = 0;
    }
    tick();
  }

  /* --------------------------------------------------------------- page */

  async function refresh(showToast) {
    await manager.scan();
    renderAll();
    if (showToast) toast('Library list updated', 1000);
  }

  function build() {
    ui.input = h('input', {
      type: 'search',
      class: 'cpp-lib-input',
      placeholder: 'Search libraries, headers or packages…',
      'aria-label': 'Search libraries',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
      oninput: () => {
        ui.query = ui.input.value;
        clear.hidden = !ui.query;
        renderList();
        renderAlpine();
      },
    });
    const clear = h('button', { type: 'button', class: 'cpp-lib-iconbtn cpp-lib-clear', hidden: true, 'aria-label': 'Clear search',
      onclick: () => { ui.input.value = ''; ui.query = ''; clear.hidden = true; renderList(); renderAlpine(); ui.input.focus(); } }, icon('close', 16));
    ui.chips = h('div', { class: 'cpp-lib-chips', role: 'tablist' });
    ui.summary = h('div', { class: 'cpp-lib-summary' });
    ui.banner = h('div', { class: 'cpp-lib-banner' });
    ui.need = h('div', { class: 'cpp-lib-need' });
    ui.list = h('div', { class: 'cpp-lib-list', role: 'list' });
    ui.alpine = h('div', { class: 'cpp-lib-alpine' });

    ui.root = h('div', { class: 'cpp-lib' },
      h('div', { class: 'cpp-lib-top' },
        h('label', { class: 'cpp-lib-search' }, icon('search'), ui.input, clear),
        ui.chips,
      ),
      ui.banner, ui.need, ui.summary, ui.list, ui.alpine,
      h('div', { class: 'cpp-lib-foot', text: 'Installed with Alpine apk · linked automatically with pkg-config' }),
    );
    ui.body = h('div', { class: 'cpp-lib-body' }, ui.root);

    const back = h('span', { class: 'icon arrow_back', dataset: { action: 'back' }, onclick: () => close() });
    ui.page = Page('Libraries', { lead: back });
    ui.page.appendBody(ui.body);
  }

  function open() {
    if (ui.isOpen) return;
    if (!ui.page) build();
    ui.isOpen = true;
    try {
      if (actionStack.has && actionStack.has(STACK_ID)) actionStack.remove(STACK_ID);
      actionStack.push({ id: STACK_ID, action: () => close(true) });
    } catch (_) {}
    try {
      (deps.mount || (typeof app !== 'undefined' && app) || document.body).append(ui.page);
    } catch (_) {
      document.body.appendChild(ui.page);
    }
    ui.unsub = manager.subscribe(() => {
      if (!ui.isOpen) return;
      renderBanner();
      renderSummary();
      renderChips();
      renderNeed();
      renderList();
      renderAlpine();
    });
    renderAll(); // skeleton first
    refresh(false);
  }

  function close(fromBack) {
    if (!ui.isOpen) return;
    ui.isOpen = false;
    if (ui.unsub) { ui.unsub(); ui.unsub = null; }
    if (ui.timer) { clearInterval(ui.timer); ui.timer = 0; }
    try { if (!fromBack && actionStack.has && actionStack.has(STACK_ID)) actionStack.remove(STACK_ID); } catch (_) {}
    try { ui.page.hide && ui.page.hide(); } catch (_) {}
    try { ui.page.remove(); } catch (_) {}
    if (deps.onClose) deps.onClose();
  }

  function destroy() {
    close();
    ui.page = null;
  }

  return { open, close, destroy, isOpen: () => ui.isOpen, refresh };
}
