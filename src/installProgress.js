// installProgress.js — live log + left-to-right shine progress (PHP-plugin style)

let root = null;
let logBox = null;
let subtitleEl = null;
let barFill = null;
let footerLabel = null;
let lineDelay = 0;
let cancelled = false;
let onCancelCb = null;

export function isInstallCancelled() {
  return cancelled;
}

export function resetInstallCancel() {
  cancelled = false;
}

/**
 * @param {{ title?: string, subtitle?: string, onCancel?: () => void }} opts
 */
export function openInstallProgress(opts = {}) {
  closeInstallProgress(true);
  cancelled = false;
  onCancelCb = typeof opts.onCancel === 'function' ? opts.onCancel : null;

  const title = opts.title || 'Installing…';
  const subtitle = opts.subtitle || 'Running in background';

  root = document.createElement('div');
  root.id = 'cpp-install-progress';
  root.innerHTML = `
    <div class="cpp-ip-backdrop"></div>
    <div class="cpp-ip-card" role="dialog" aria-live="polite" aria-label="${escapeHtml(title)}">
      <div class="cpp-ip-header">
        <div class="cpp-ip-title">${escapeHtml(title)}</div>
        <div class="cpp-ip-subtitle cpp-ip-pulse">${escapeHtml(subtitle)}</div>
      </div>
      <div class="cpp-ip-bar-track"><div class="cpp-ip-bar-fill"></div></div>
      <div class="cpp-ip-logs"></div>
      <div class="cpp-ip-footer">
        <span class="cpp-ip-dot"></span>
        <span class="cpp-ip-footer-label">Background install · please wait</span>
        <button type="button" class="cpp-ip-cancel-btn">Cancel setup</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  logBox = root.querySelector('.cpp-ip-logs');
  subtitleEl = root.querySelector('.cpp-ip-subtitle');
  barFill = root.querySelector('.cpp-ip-bar-fill');
  footerLabel = root.querySelector('.cpp-ip-footer-label');
  lineDelay = 0;

  const cancelBtn = root.querySelector('.cpp-ip-cancel-btn');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      cancelled = true;
      appendInstallLog('User cancelled setup', 'err');
      setInstallSubtitle('Cancelled');
      setInstallFooter('Setup cancelled');
      if (onCancelCb) {
        try {
          onCancelCb();
        } catch (_) {}
      }
      setTimeout(() => closeInstallProgress(), 500);
    };
  }

  return root;
}

export function setInstallSubtitle(text) {
  if (!subtitleEl) return;
  subtitleEl.style.opacity = '0';
  setTimeout(() => {
    if (!subtitleEl) return;
    subtitleEl.textContent = text;
    subtitleEl.style.opacity = '1';
  }, 180);
}

export function setInstallPercent(pct) {
  if (!barFill) return;
  const n = Math.max(0, Math.min(100, pct | 0));
  barFill.classList.add('is-determinate');
  barFill.style.width = n + '%';
}

export function appendInstallLog(text, kind = 'info') {
  if (!logBox || text == null) return;
  const lines = String(text)
    .split(/\r?\n/)
    .filter(l => l.trim() !== '');
  lines.forEach((line, i) => {
    const delay = lineDelay + i * 40;
    setTimeout(() => {
      if (!logBox) return;
      const row = document.createElement('div');
      row.className = `cpp-ip-log-line cpp-ip-${kind}`;
      row.textContent = line.length > 240 ? line.slice(0, 237) + '…' : line;
      logBox.appendChild(row);
      logBox.scrollTop = logBox.scrollHeight;
    }, delay);
  });
  lineDelay = Math.min(lineDelay + lines.length * 40, 800);
  setTimeout(() => {
    lineDelay = Math.max(0, lineDelay - 200);
  }, 600);
}

export function appendInstallOutput(output) {
  if (!output) return;
  String(output)
    .split(/\r?\n/)
    .forEach(line => {
      const t = line.trim();
      if (!t) return;
      let kind = 'dim';
      if (/error|failed|fatal|not found|cancel/i.test(t)) kind = 'err';
      else if (/ok|complete|success|installed|ready|done/i.test(t)) kind = 'ok';
      else if (/install|fetch|download|unpack|setting|checking|gcc|g\+\+|clang|apk|pkg|make|bc/i.test(t))
        kind = 'info';
      appendInstallLog(t, kind);
    });
}

export function setInstallFooter(text) {
  if (footerLabel) footerLabel.textContent = text;
}

export function closeInstallProgress(immediate = false) {
  if (!root) return;
  const el = root;
  root = null;
  logBox = null;
  subtitleEl = null;
  barFill = null;
  footerLabel = null;
  lineDelay = 0;
  onCancelCb = null;

  if (immediate) {
    el.remove();
    return;
  }
  el.classList.add('cpp-ip-leaving');
  setTimeout(() => el.remove(), 320);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Run install steps; respects Cancel (isInstallCancelled).
 */
export async function runInstallSteps(title, steps) {
  resetInstallCancel();
  openInstallProgress({
    title,
    subtitle: steps[0]?.label || 'Starting…'
  });
  setInstallFooter('Background · Cancel anytime');

  const total = steps.length;
  try {
    for (let i = 0; i < total; i++) {
      if (cancelled) {
        appendInstallLog('Stopped by user', 'err');
        closeInstallProgress();
        return false;
      }
      const step = steps[i];
      setInstallSubtitle(step.label);
      setInstallPercent(Math.round((i / total) * 100));
      appendInstallLog(`→ ${step.label}`, 'info');

      try {
        const out = await step.run();
        if (cancelled) {
          closeInstallProgress();
          return false;
        }
        if (out) appendInstallOutput(out);
        appendInstallLog('✓ done', 'ok');
      } catch (e) {
        if (cancelled) {
          closeInstallProgress();
          return false;
        }
        appendInstallLog(String(e.message || e), 'err');
        throw e;
      }
    }
    setInstallPercent(100);
    setInstallSubtitle('Complete');
    setInstallFooter('Finished');
    appendInstallLog('All steps finished successfully', 'ok');
    await sleep(700);
    closeInstallProgress();
    return true;
  } catch (e) {
    setInstallSubtitle('Failed');
    setInstallFooter('Error — see log');
    appendInstallLog(String(e.message || e), 'err');
    await sleep(1400);
    closeInstallProgress();
    return false;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
