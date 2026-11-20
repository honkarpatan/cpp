// src/libraries/libManager.js
// Installs / removes / scans C/C++ libraries through Alpine's `apk`.
// No `acode` / DOM here — the shell runner is injected so it can be tested.

import { LIBRARIES } from './catalog.js';

const PKG_RE = /^[a-z0-9][a-z0-9._+-]*$/;
const PKGCONF = 'pkgconf';

function b64(str) {
  return typeof btoa === 'function' ? btoa(str) : Buffer.from(str, 'utf8').toString('base64');
}

function safePkgs(list) {
  const out = (list || []).map(String).filter((p) => PKG_RE.test(p));
  if (out.length !== (list || []).length) throw new Error('Invalid package name');
  return out;
}

/** Last non-empty, human-meaningful lines of apk output (for error display). */
export function tailOutput(output, n = 6) {
  return String(output || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\(\d+\/\d+\)/.test(l))
    .slice(-n)
    .join('\n');
}

/** Turn raw apk output into a short reason a user can act on. */
export function explainApkFailure(output) {
  const text = String(output || '');
  if (/temporary error|network|could not resolve|unable to connect|fetch .* failed|DNS/i.test(text)) {
    return 'Network problem — check your internet connection and try again.';
  }
  if (/unable to select packages|no such package|not found in/i.test(text)) {
    return 'Package not found in your Alpine repositories (try updating the package index).';
  }
  if (/no space left/i.test(text)) return 'Not enough storage space.';
  if (/lock|locked/i.test(text) && /database/i.test(text)) return 'Another package operation is running. Try again in a moment.';
  return tailOutput(text, 3) || 'Package manager reported an error.';
}

/**
 * @param {{ exec: (cmd: string) => Promise<string>, now?: () => number }} deps
 */
export function createLibManager({ exec, now = () => Date.now() }) {
  const listeners = new Set();
  const state = {
    apk: null, // null = unknown, true/false after first scan
    scanned: false,
    installed: new Set(), // catalog ids whose apk packages are all installed
    extra: new Set(), // other apk packages the user installed via search
    pkgconf: false,
    busy: new Map(), // key -> { op, phase: 'queued'|'running', since }
    errors: new Map(), // key -> { message, details }
  };

  let queue = Promise.resolve();

  const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (_) {} });

  function runScript(script) {
    return exec(`echo ${b64(script)} | base64 -d | sh`);
  }

  let pending = 0; // tasks queued or running

  function enqueue(key, op, task) {
    // idle queue → the task starts right away, so show "running" (not a "queued" flash)
    state.busy.set(key, { op, phase: pending === 0 ? 'running' : 'queued', since: now() });
    pending++;
    state.errors.delete(key);
    emit();
    const run = queue.then(async () => {
      state.busy.set(key, { op, phase: 'running', since: now() });
      emit();
      try {
        return await task();
      } finally {
        pending--;
        state.busy.delete(key);
        emit();
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  /** Which of `names` are installed (apk info -e prints the installed ones). */
  async function installedAmong(names) {
    const list = safePkgs(names);
    if (!list.length) return new Set();
    const out = await runScript(`apk info -e ${list.join(' ')} 2>/dev/null; true`);
    const set = new Set();
    for (const tok of String(out || '').split(/\s+/)) if (list.includes(tok)) set.add(tok);
    return set;
  }

  async function scan() {
    try {
      const probe = await runScript('command -v apk >/dev/null 2>&1 && echo APK_OK || echo APK_MISSING');
      state.apk = /APK_OK/.test(probe || '');
    } catch (_) {
      state.apk = false;
    }
    if (!state.apk) {
      state.scanned = true;
      emit();
      return state;
    }
    const all = new Set([PKGCONF]);
    for (const l of LIBRARIES) l.apk.forEach((p) => all.add(p));
    const have = await installedAmong([...all]);
    state.installed = new Set(LIBRARIES.filter((l) => l.apk.every((p) => have.has(p))).map((l) => l.id));
    state.pkgconf = have.has(PKGCONF);
    state.scanned = true;
    emit();
    return state;
  }

  /** apk add with one automatic index refresh retry; verifies the result. */
  function addScript(pkgs) {
    const list = pkgs.join(' ');
    return [
      `apk add ${list} 2>&1`,
      'RC=$?',
      'if [ "$RC" -ne 0 ]; then',
      '  echo "[retry] updating package index"',
      '  apk update 2>&1',
      `  apk add ${list} 2>&1`,
      'fi',
      `apk info -e ${list} >/dev/null 2>&1 && echo "[verify] ok" || echo "[verify] missing"`,
    ].join('\n');
  }

  async function installPackages(key, pkgs, { withPkgconf = true } = {}) {
    const list = safePkgs(pkgs);
    const want = withPkgconf && !state.pkgconf ? [...list, PKGCONF] : list;
    const out = await runScript(addScript(want));
    const ok = /\[verify\] ok/.test(out || '');
    if (ok) {
      if (withPkgconf) state.pkgconf = true;
      state.errors.delete(key);
    } else {
      state.errors.set(key, { message: explainApkFailure(out), details: tailOutput(out, 12) });
    }
    return { ok, output: out || '' };
  }

  function install(lib) {
    return enqueue(lib.id, 'install', async () => {
      const res = await installPackages(lib.id, lib.apk);
      if (res.ok) state.installed.add(lib.id);
      return res;
    });
  }

  function remove(lib) {
    return enqueue(lib.id, 'remove', async () => {
      const list = safePkgs(lib.apk);
      const out = await runScript(`apk del ${list.join(' ')} 2>&1; apk info -e ${list.join(' ')} >/dev/null 2>&1 && echo "[verify] still" || echo "[verify] gone"`);
      const ok = /\[verify\] gone/.test(out || '');
      if (ok) state.installed.delete(lib.id);
      else state.errors.set(lib.id, { message: explainApkFailure(out), details: tailOutput(out, 12) });
      return { ok, output: out || '' };
    });
  }

  /** Install / remove an arbitrary apk package found through search. */
  function installPackage(name) {
    return enqueue('pkg:' + name, 'install', async () => {
      const res = await installPackages('pkg:' + name, [name], { withPkgconf: false });
      if (res.ok) state.extra.add(name);
      return res;
    });
  }

  function removePackage(name) {
    return enqueue('pkg:' + name, 'remove', async () => {
      const list = safePkgs([name]);
      const out = await runScript(`apk del ${list[0]} 2>&1; apk info -e ${list[0]} >/dev/null 2>&1 && echo "[verify] still" || echo "[verify] gone"`);
      const ok = /\[verify\] gone/.test(out || '');
      if (ok) state.extra.delete(name);
      else state.errors.set('pkg:' + name, { message: explainApkFailure(out), details: tailOutput(out, 12) });
      return { ok, output: out || '' };
    });
  }

  /**
   * Search every `-dev` package of the Alpine repositories.
   * @returns {Promise<{ name: string, installed: boolean }[]>}
   */
  async function searchAlpine(query) {
    const q = String(query || '').trim().toLowerCase().replace(/[^a-z0-9._+-]/g, '');
    if (q.length < 2) return [];
    const script = [
      `R=$(apk search -q '*${q}*' 2>/dev/null | grep -- '-dev$' | sort | head -40)`,
      'if [ -z "$R" ]; then apk update >/dev/null 2>&1; ' +
        `R=$(apk search -q '*${q}*' 2>/dev/null | grep -- '-dev$' | sort | head -40); fi`,
      'echo "$R"',
    ].join('\n');
    const out = await runScript(script);
    const names = [...new Set(String(out || '').split(/\s+/).filter((t) => PKG_RE.test(t) && t.endsWith('-dev')))];
    if (!names.length) return [];
    const have = await installedAmong(names);
    names.forEach((n) => have.has(n) && state.extra.add(n));
    return names.map((name) => ({ name, installed: have.has(name) }));
  }

  return {
    state,
    scan,
    install,
    remove,
    installPackage,
    removePackage,
    searchAlpine,
    installedAmong,
    isInstalled: (id) => state.installed.has(id),
    isBusy: (key) => state.busy.get(key) || null,
    getError: (key) => state.errors.get(key) || null,
    clearError(key) {
      state.errors.delete(key);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
