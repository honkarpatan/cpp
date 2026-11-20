// dependencyChecker.js — C / C++ dep groups + picker UI + selective install

import { getSettings } from './settings.js';
import { executeCommand, shellEscape, toBase64, runCommand } from './terminalManager.js';
import {
  runInstallSteps,
  appendInstallLog,
  isInstallCancelled,
  resetInstallCancel
} from './installProgress.js';
import { openDepsPicker, updateDepsPicker, isDepsPickerOpen } from './depsPicker.js';

const confirm = acode.require('confirm');
const toast = acode.require('toast');

const MARKER_DIR = '$HOME/.cpp_workstation';
const MARKER_FILE = MARKER_DIR + '/.cpp_installed_lock';

/**
 * Catalog: separate C vs C++ vs shared.
 * id = binary name used with command -v
 */
export const DEP_CATALOG = [
  {
    id: 'gcc',
    label: 'gcc',
    desc: 'C compiler',
    group: 'c',
    packages: { apk: 'gcc musl-dev', pkg: 'clang', apt: 'gcc' }
  },
  {
    id: 'g++',
    label: 'g++',
    desc: 'C++ compiler',
    group: 'cpp',
    packages: { apk: 'g++', pkg: 'clang', apt: 'g++' }
  },
  {
    id: 'make',
    label: 'make',
    desc: 'Build tool',
    group: 'shared',
    packages: { apk: 'make', pkg: 'make', apt: 'make' }
  },
  {
    id: 'bc',
    label: 'bc',
    desc: 'Calculator (scripts)',
    group: 'shared',
    packages: { apk: 'bc', pkg: 'bc', apt: 'bc' }
  },
  {
    id: 'clangd',
    label: 'clangd',
    desc: 'LSP language server',
    group: 'shared',
    packages: { apk: 'clang-extra-tools clang', pkg: 'clang', apt: 'clangd clang' },
    optional: true
  }
];

let installInFlight = false;
/** @type {{ c: boolean, cpp: boolean }} dismissed until plugin/app restart */
const dismissedUntilRestart = { c: false, cpp: false };

function isCFileName(name) {
  return /\.c$/i.test(name || '') && !/\.(cpp|cxx|cc|c\+\+)$/i.test(name || '');
}
function isCppFileName(name) {
  return /\.(cpp|cxx|cc|c\+\+|hpp|hh|hxx|h)$/i.test(name || '');
}

/** Active language focus from open file */
export function getActiveLangFocus() {
  const name = editorManager?.activeFile?.filename || '';
  if (isCFileName(name)) return 'c';
  if (/\.(cpp|cxx|cc|c\+\+)$/i.test(name)) return 'cpp';
  // headers: treat as both / prefer cpp if any cpp open — default shared focus
  if (/\.(h|hpp|hh|hxx)$/i.test(name)) return 'cpp';
  return 'all';
}

async function markInstalled(value = true) {
  try {
    const settings = getSettings();
    settings.dependenciesInstalled = !!value;
    acode.require('settings').update(false);
  } catch (_) {}
}

export async function checkCommand(cmd) {
  try {
    const out = await executeCommand(
      `sh -c 'command -v ${cmd} >/dev/null 2>&1 && echo OK || which ${cmd} 2>/dev/null | head -1'`,
      true
    );
    const t = (out || '').trim();
    return t.includes('OK') || (t.includes('/') && !/not found|no such/i.test(t));
  } catch (_) {
    return false;
  }
}

/** Full status for every catalog entry */
export async function scanAllDeps() {
  const results = await Promise.all(
    DEP_CATALOG.map(async dep => {
      const present = await checkCommand(dep.id);
      return { ...dep, present };
    })
  );
  return results;
}

/**
 * Required ids for a language focus.
 * C needs gcc (+ shared). C++ needs g++ (+ shared). clangd optional unless LSP on.
 */
export function requiredIdsFor(focus) {
  const settings = getSettings();
  const wantClangd =
    settings.enableLspCompletion ||
    settings.enableHover ||
    settings.enableGoToDefinition ||
    settings.enableFindReferences ||
    settings.enableRename;

  const ids = new Set();
  if (focus === 'c' || focus === 'all') {
    ids.add('gcc');
    ids.add('bc');
    ids.add('make');
  }
  if (focus === 'cpp' || focus === 'all') {
    ids.add('g++');
    ids.add('bc');
    ids.add('make');
  }
  if (wantClangd) ids.add('clangd');
  return ids;
}

export async function verifyDependencies(focus = 'all') {
  const all = await scanAllDeps();
  const need = requiredIdsFor(focus);
  const relevant = all.filter(d => need.has(d.id));
  const missing = relevant.filter(d => !d.present).map(d => d.id);
  const present = relevant.filter(d => d.present).map(d => d.id);
  return {
    ok: missing.length === 0,
    missing,
    present,
    deps: relevant.map(d => d.id),
    all
  };
}

// ---- readiness cache -------------------------------------------------------
// Live lint calls ensureCDeps() on every run. Without a cache that spawns one proot
// process per catalog entry (gcc, g++, make, bc, clangd) each time (seconds of delay).
// Only a *positive* result is cached; install / uninstall invalidate it.
const DEPS_READY_TTL_MS = 5 * 60 * 1000;
let depsReadyCache = { key: '', until: 0 };
let depsReadyInFlight = null; // { key, promise }

export function invalidateDepsCache() {
  depsReadyCache = { key: '', until: 0 };
  depsReadyInFlight = null;
}

export async function areCoreDepsReady(focus) {
  const f = focus || getActiveLangFocus();
  const key = f + '|' + [...requiredIdsFor(f === 'all' ? 'all' : f)].sort().join(',');
  if (depsReadyCache.key === key && Date.now() < depsReadyCache.until) return true;
  if (depsReadyInFlight && depsReadyInFlight.key === key) return depsReadyInFlight.promise;

  const promise = computeCoreDepsReady(f)
    .then(ok => {
      if (ok) depsReadyCache = { key, until: Date.now() + DEPS_READY_TTL_MS };
      return ok;
    })
    .finally(() => {
      if (depsReadyInFlight && depsReadyInFlight.promise === promise) depsReadyInFlight = null;
    });
  depsReadyInFlight = { key, promise };
  return promise;
}

async function computeCoreDepsReady(focus) {
  const f = focus || getActiveLangFocus();
  // For readiness of run/lint: C file → gcc; cpp → g++; headers → either
  let checkFocus = f;
  if (f === 'all') checkFocus = 'all';
  const { ok, all } = await verifyDependencies(checkFocus === 'all' ? 'all' : checkFocus);

  // Soft: if checking C, only gcc must exist for "ready enough to lint C"
  if (checkFocus === 'c') {
    const gcc = all.find(d => d.id === 'gcc');
    if (gcc?.present) {
      await markInstalled(true);
      return true;
    }
    await markInstalled(false);
    return false;
  }
  if (checkFocus === 'cpp') {
    const gpp = all.find(d => d.id === 'g++');
    if (gpp?.present) {
      await markInstalled(true);
      return true;
    }
    await markInstalled(false);
    return false;
  }
  if (ok) {
    await markInstalled(true);
    return true;
  }
  await markInstalled(false);
  return false;
}

function stepUpdate() {
  return executeCommand(
    "sh -c 'apk update 2>&1 || pkg update -y 2>&1 || apt-get update -y 2>&1 || true'",
    true
  );
}

/** Install specific package ids from catalog */
function stepInstallSelected(ids) {
  const list = ids && ids.length ? ids : DEP_CATALOG.map(d => d.id);
  const script = [
    'echo "[C/C++] Installing: ' + list.join(' ') + '"',
    'PKGS=""',
    'if command -v apk >/dev/null 2>&1; then PM=apk',
    'elif command -v pkg >/dev/null 2>&1; then PM=pkg',
    'elif command -v apt-get >/dev/null 2>&1; then PM=apt',
    'else PM=none; fi',
    'echo "[pm] $PM"'
  ];

  for (const id of list) {
    const dep = DEP_CATALOG.find(d => d.id === id);
    if (!dep) continue;
    script.push(`echo "[install] ${id}"`);
    script.push(
      `case "$PM" in`,
      `  apk) apk add ${dep.packages.apk} 2>&1 || true ;;`,
      `  pkg) pkg install ${dep.packages.pkg} -y 2>&1 || true ;;`,
      `  apt) apt-get install -y ${dep.packages.apt} 2>&1 || true ;;`,
      `  *) echo "no package manager" ;;`,
      `esac`
    );
  }

  // Termux often only has clang — symlink gcc/g++
  script.push(
    'if command -v pkg >/dev/null 2>&1; then',
    '  if ! command -v g++ >/dev/null 2>&1 && command -v clang++ >/dev/null 2>&1; then',
    '    ln -sf "$(command -v clang++)" "$PREFIX/bin/g++" 2>/dev/null || true',
    '    echo "[link] g++ → clang++"',
    '  fi',
    '  if ! command -v gcc >/dev/null 2>&1 && command -v clang >/dev/null 2>&1; then',
    '    ln -sf "$(command -v clang)" "$PREFIX/bin/gcc" 2>/dev/null || true',
    '    echo "[link] gcc → clang"',
    '  fi',
    'fi'
  );

  for (const id of list) {
    script.push(
      `command -v ${id} >/dev/null 2>&1 && echo "[ok] ${id}" || echo "[missing] ${id}"`
    );
  }

  const b64 = toBase64(script.join('\n'));
  return executeCommand("sh -c 'echo " + shellEscape(b64) + " | base64 -d | sh'", true);
}

function stepUninstallSelected(ids) {
  const list = ids && ids.length ? ids : [];
  const script = ['echo "[C/C++] Uninstalling: ' + list.join(' ') + '"'];
  for (const id of list) {
    const dep = DEP_CATALOG.find(d => d.id === id);
    if (!dep) continue;
    script.push(
      'if command -v apk >/dev/null 2>&1; then',
      `  apk del ${dep.packages.apk} 2>&1 || true`,
      'elif command -v pkg >/dev/null 2>&1; then',
      `  pkg uninstall ${dep.packages.pkg} -y 2>&1 || true`,
      'elif command -v apt-get >/dev/null 2>&1; then',
      `  apt-get remove -y ${dep.packages.apt} 2>&1 || true`,
      'fi'
    );
  }
  script.push('rm -f ' + MARKER_FILE + ' 2>/dev/null || true');
  script.push('echo "[C/C++] uninstall done"');
  const b64 = toBase64(script.join('\n'));
  return executeCommand("sh -c 'echo " + shellEscape(b64) + " | base64 -d | sh'", true);
}

function stepMarker() {
  const script = [
    `mkdir -p ${MARKER_DIR}`,
    'if command -v gcc >/dev/null 2>&1 || command -v g++ >/dev/null 2>&1; then',
    `  echo installed > ${MARKER_FILE}`,
    '  echo "[C/C++] marker written"',
    '  command -v gcc >/dev/null && gcc --version | head -1 || true',
    '  command -v g++ >/dev/null && g++ --version | head -1 || true',
    'else',
    '  echo "[C/C++] no gcc/g++ yet"',
    '  exit 0',
    'fi'
  ].join('\n');
  const b64 = toBase64(script);
  return executeCommand("sh -c 'echo " + shellEscape(b64) + " | base64 -d | sh'", true);
}

async function runInstallSelected(ids, title) {
  if (installInFlight) {
    toast('Setup already running…', 2000);
    return false;
  }
  if (!ids || !ids.length) {
    toast('Nothing selected', 2000);
    return false;
  }
  installInFlight = true;
  invalidateDepsCache();
  resetInstallCancel();
  try {
    const ok = await runInstallSteps(title || 'Installing dependencies', [
      { label: 'Updating package index…', run: stepUpdate },
      {
        label: 'Installing ' + ids.join(', ') + '…',
        run: () => stepInstallSelected(ids)
      },
      { label: 'Verifying…', run: stepMarker }
    ]);
    if (isInstallCancelled()) {
      toast('Install cancelled', 2500);
      installInFlight = false;
      return false;
    }
    invalidateDepsCache();
    const all = await scanAllDeps();
    const still = ids.filter(id => !all.find(d => d.id === id)?.present);
    if (still.length) {
      toast('Still missing: ' + still.join(', '), 4000);
    } else {
      toast('Installed: ' + ids.join(', '), 3000);
    }
    if (all.some(d => d.id === 'gcc' && d.present) || all.some(d => d.id === 'g++' && d.present)) {
      await markInstalled(true);
    }
    try {
      await runCommand('echo "[C/C++] deps updated: ' + ids.join(' ') + '"');
    } catch (_) {}
    installInFlight = false;
    return still.length === 0;
  } catch (e) {
    console.error('[Deps install]', e);
    appendInstallLog(String(e.message || e), 'err');
    toast('Install error: ' + (e.message || e), 4000);
    installInFlight = false;
    return false;
  }
}

async function runUninstallSelected(ids) {
  if (installInFlight) {
    toast('Setup already running…', 2000);
    return false;
  }
  installInFlight = true;
  invalidateDepsCache();
  resetInstallCancel();
  try {
    const ok = await runInstallSteps('Uninstall dependencies', [
      {
        label: 'Removing ' + ids.join(', ') + '…',
        run: () => stepUninstallSelected(ids)
      }
    ]);
    invalidateDepsCache();
    await markInstalled(false);
    toast(ok ? 'Removed: ' + ids.join(', ') : 'Uninstall finished', 3000);
    installInFlight = false;
    return ok;
  } catch (e) {
    installInFlight = false;
    toast('Uninstall error: ' + (e.message || e), 3500);
    return false;
  }
}

/**
 * Build picker items from scan; missing pre-checked.
 * @param {'c'|'cpp'|'all'} focus
 */
function toPickerItems(all, focus) {
  return all.map(d => ({
    id: d.id,
    label: d.label,
    desc: d.desc,
    group: d.group,
    present: d.present,
    checked: !d.present
  }));
}

/**
 * Show deps picker (checking → list). No plain confirm first.
 * @param {{ force?: boolean, focus?: 'c'|'cpp'|'all', fromSettings?: boolean }} opts
 */
export async function showDepsPickerFlow(opts = {}) {
  if (installInFlight || isDepsPickerOpen()) {
    toast('Dependency UI already open…', 2000);
    return false;
  }

  const focus = opts.focus || getActiveLangFocus();
  const dismissKey = focus === 'c' ? 'c' : focus === 'cpp' ? 'cpp' : null;

  // Auto popup only if this language has missing required deps
  if (!opts.force && !opts.fromSettings) {
    if (dismissKey && dismissedUntilRestart[dismissKey]) return false;
    const v = await verifyDependencies(focus === 'all' ? 'all' : focus);
    if (v.ok) {
      await markInstalled(true);
      return true;
    }
  }

  // Pre-scan when auto (no force): skip UI entirely if focus lang is ready
  if (!opts.force && !opts.fromSettings) {
    const pre = await verifyDependencies(focus === 'all' ? 'all' : focus);
    if (pre.ok) {
      await markInstalled(true);
      return true;
    }
  }

  // Open UI in checking state first
  const promise = openDepsPicker({
    title: 'C / C++ Dependencies',
    subtitle: 'Checking…',
    activeGroup: focus === 'all' ? 'all' : focus,
    items: [],
    checking: true
  });

  // Scan while UI shows spinner (full catalog — user may install C or C++)
  let all;
  try {
    all = await scanAllDeps();
  } catch (e) {
    updateDepsPicker({
      checking: false,
      subtitle: 'Check failed — close and try again',
      items: []
    });
    await promise;
    return false;
  }

  const missCount = all.filter(d => !d.present).length;
  updateDepsPicker({
    checking: false,
    subtitle:
      missCount === 0
        ? 'Everything installed — tick to reinstall or use icons'
        : `${missCount} missing · tick what to install · C and C++ listed`,
    items: toPickerItems(all, focus)
  });

  const result = await promise;

  if (result.action === 'notnow' || result.action === 'close') {
    if (dismissKey) dismissedUntilRestart[dismissKey] = true;
    toast('Skipped for this session', 2500);
    return false;
  }

  if (result.action === 'reinstall' && result.selected?.length) {
    return runInstallSelected(result.selected, 'Reinstall ' + result.selected.join(', '));
  }
  if (result.action === 'uninstall' && result.selected?.length) {
    return runUninstallSelected(result.selected);
  }
  if (result.action === 'install' && result.selected?.length) {
    return runInstallSelected(result.selected, 'Install selected dependencies');
  }
  return false;
}

/**
 * Ensure deps for current file language — shows picker if missing (no plain confirm).
 */
export async function ensureDependencies(opts = {}) {
  const focus = opts.focus || getActiveLangFocus();
  if (await areCoreDepsReady(focus)) return true;
  return showDepsPickerFlow({
    force: !!opts.force,
    focus,
    fromSettings: !!opts.fromSettings
  });
}

/**
 * Call from runner / linter / run button.
 */
export async function ensureCDeps(reason) {
  const opts =
    reason && typeof reason === 'object'
      ? reason
      : { force: false, focus: getActiveLangFocus() };
  if (!opts.focus) opts.focus = getActiveLangFocus();
  if (await areCoreDepsReady(opts.focus)) return true;
  return showDepsPickerFlow(opts);
}

/** Settings: Check Dependencies */
export async function checkDependenciesAction() {
  return showDepsPickerFlow({ force: true, fromSettings: true, focus: 'all' });
}

/** Settings: Reinstall all catalog packages */
export async function reinstallDependenciesAction() {
  const agreed = await confirm(
    'Reinstall all C/C++ tools?',
    'This will reinstall gcc, g++, make, bc and clangd.\n\nContinue?'
  );
  if (!agreed) {
    toast('Reinstall cancelled', 2000);
    return false;
  }
  return runInstallSelected(
    DEP_CATALOG.map(d => d.id),
    'Reinstall all dependencies'
  );
}

/** Settings: Uninstall all */
export async function uninstallDependenciesAction() {
  const agreed = await confirm(
    'Uninstall all C/C++ deps?',
    'This will try to remove gcc, g++, make, bc, clangd and clear the install flag.\n\nContinue?'
  );
  if (!agreed) {
    toast('Uninstall cancelled', 2000);
    return false;
  }
  return runUninstallSelected(DEP_CATALOG.map(d => d.id));
}

export function isSetupInProgress() {
  return installInFlight;
}

export { runInstallSteps };
