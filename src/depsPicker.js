// depsPicker.js — missing-deps UI with C / C++ groups, tick, reinstall/uninstall icons

const confirm = acode.require('confirm');

/** @type {HTMLElement|null} */
let root = null;

const REINSTALL_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;
const UNINSTALL_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @typedef {{ id: string, label: string, desc?: string, group: 'c'|'cpp'|'shared', present: boolean }} DepItem
 *
 * @param {{
 *   title?: string,
 *   subtitle?: string,
 *   activeGroup?: 'c'|'cpp'|'all',
 *   items: DepItem[],
 *   checking?: boolean
 * }} opts
 * @returns {Promise<{ action: 'install'|'notnow'|'close', selected: string[] }>}
 */
export function openDepsPicker(opts) {
  return new Promise(resolve => {
    closeDepsPicker(true);

    const title = opts.title || 'Dependencies';
    const subtitle = opts.subtitle || '';
    const activeGroup = opts.activeGroup || 'all';
    const items = (opts.items || []).map(it => ({
      ...it,
      // missing → pre-checked; present → unchecked (user can still reinstall via icon)
      checked: !it.present
    }));

    root = document.createElement('div');
    root.id = 'cpp-deps-picker';
    root.innerHTML = `
      <div class="cpp-dp-backdrop"></div>
      <div class="cpp-dp-card" role="dialog" aria-label="${escapeHtml(title)}">
        <div class="cpp-dp-header">
          <div class="cpp-dp-title">${escapeHtml(title)}</div>
          <div class="cpp-dp-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <div class="cpp-dp-body">
          <div class="cpp-dp-checking" style="display:${opts.checking ? 'flex' : 'none'}">
            <span class="cpp-dp-spinner"></span>
            <span>Checking dependencies…</span>
          </div>
          <div class="cpp-dp-lists" style="display:${opts.checking ? 'none' : 'block'}"></div>
        </div>
        <div class="cpp-dp-footer">
          <button type="button" class="cpp-dp-btn cpp-dp-notnow">Not now</button>
          <button type="button" class="cpp-dp-btn cpp-dp-install">Install selected</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const listsEl = root.querySelector('.cpp-dp-lists');
    const checkingEl = root.querySelector('.cpp-dp-checking');
    const installBtn = root.querySelector('.cpp-dp-install');
    const notNowBtn = root.querySelector('.cpp-dp-notnow');
    const subtitleEl = root.querySelector('.cpp-dp-subtitle');

    function renderLists() {
      if (!listsEl) return;
      const groups = [
        { key: 'c', title: 'C toolchain', hint: 'Needed for .c files (gcc)' },
        { key: 'cpp', title: 'C++ toolchain', hint: 'Needed for .cpp / .cxx files (g++)' },
        { key: 'shared', title: 'Shared tools', hint: 'Used by both C and C++' }
      ];

      let html = '';
      for (const g of groups) {
        const groupItems = items.filter(i => i.group === g.key);
        if (!groupItems.length) continue;
        const focused = activeGroup === g.key || activeGroup === 'all';
        html += `
          <div class="cpp-dp-group ${focused ? 'is-focus' : 'is-dim'}" data-group="${g.key}">
            <div class="cpp-dp-group-head">
              <span class="cpp-dp-group-title">${escapeHtml(g.title)}</span>
              <span class="cpp-dp-group-hint">${escapeHtml(g.hint)}</span>
            </div>
            <div class="cpp-dp-group-items">
        `;
        for (const it of groupItems) {
          const status = it.present
            ? '<span class="cpp-dp-status ok">installed</span>'
            : '<span class="cpp-dp-status miss">missing</span>';
          html += `
            <label class="cpp-dp-row ${it.present ? 'is-present' : 'is-missing'}">
              <input type="checkbox" data-id="${escapeHtml(it.id)}" ${it.checked ? 'checked' : ''} />
              <span class="cpp-dp-row-main">
                <span class="cpp-dp-name">${escapeHtml(it.label || it.id)}</span>
                ${it.desc ? `<span class="cpp-dp-desc">${escapeHtml(it.desc)}</span>` : ''}
              </span>
              ${status}
              <button type="button" class="cpp-dp-icon-btn cpp-dp-reinstall" data-id="${escapeHtml(it.id)}" title="Reinstall">${REINSTALL_SVG}</button>
              <button type="button" class="cpp-dp-icon-btn cpp-dp-uninstall" data-id="${escapeHtml(it.id)}" title="Uninstall" ${it.present ? '' : 'disabled'}>${UNINSTALL_SVG}</button>
            </label>
          `;
        }
        html += `</div></div>`;
      }
      listsEl.innerHTML = html || '<div class="cpp-dp-empty">No dependency items</div>';

      listsEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = cb.getAttribute('data-id');
          const item = items.find(x => x.id === id);
          if (item) item.checked = !!cb.checked;
          updateInstallLabel();
        });
      });

      listsEl.querySelectorAll('.cpp-dp-reinstall').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.preventDefault();
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const item = items.find(x => x.id === id);
          if (!item) return;
          const ok = await confirm(
            'Reinstall ' + item.label + '?',
            `This will reinstall "${item.label}" (${item.id}).\n\nContinue?`
          );
          if (!ok) return;
          finish('reinstall', [item.id]);
        });
      });

      listsEl.querySelectorAll('.cpp-dp-uninstall').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.preventDefault();
          e.stopPropagation();
          if (btn.disabled) return;
          const id = btn.getAttribute('data-id');
          const item = items.find(x => x.id === id);
          if (!item) return;
          const ok = await confirm(
            'Uninstall ' + item.label + '?',
            `This will try to remove "${item.label}" (${item.id}) from the system.\n\nContinue?`
          );
          if (!ok) return;
          finish('uninstall', [item.id]);
        });
      });

      updateInstallLabel();
    }

    function selectedIds() {
      return items.filter(i => i.checked).map(i => i.id);
    }

    function updateInstallLabel() {
      if (!installBtn) return;
      const n = selectedIds().length;
      installBtn.textContent = n ? `Install selected (${n})` : 'Install selected';
      installBtn.disabled = n === 0;
    }

    function finish(action, selected) {
      closeDepsPicker();
      resolve({ action, selected: selected || [] });
    }

    notNowBtn.onclick = () => finish('notnow', []);
    installBtn.onclick = () => {
      const sel = selectedIds();
      if (!sel.length) return;
      finish('install', sel);
    };
    root.querySelector('.cpp-dp-backdrop')?.addEventListener('click', () => finish('notnow', []));

    if (!opts.checking) renderLists();

    // Expose updater for caller that starts in checking mode
    root._cppDpUpdate = status => {
      if (status.checking === false && checkingEl && listsEl) {
        checkingEl.style.display = 'none';
        listsEl.style.display = 'block';
      }
      if (status.subtitle != null && subtitleEl) subtitleEl.textContent = status.subtitle;
      if (Array.isArray(status.items)) {
        items.length = 0;
        status.items.forEach(it => {
          items.push({
            ...it,
            checked: it.checked != null ? !!it.checked : !it.present
          });
        });
        renderLists();
      }
    };
  });
}

export function updateDepsPicker(status) {
  if (root && typeof root._cppDpUpdate === 'function') {
    root._cppDpUpdate(status);
  }
}

export function closeDepsPicker(immediate = false) {
  if (!root) return;
  const el = root;
  root = null;
  if (immediate) {
    el.remove();
    return;
  }
  el.classList.add('cpp-dp-leaving');
  setTimeout(() => el.remove(), 280);
}

export function isDepsPickerOpen() {
  return !!root;
}
