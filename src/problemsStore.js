// src/problemsStore.js
// Central store for C/C++ diagnostics across open files.

/** @typedef {{ type: 'error'|'warning'|'info', row: number, column: number, text: string }} ProblemItem */
/** @typedef {{ fileUri: string, fileName: string, problems: ProblemItem[], updatedAt: number }} FileProblems */

/** @type {Map<string, FileProblems>} key = fileUri or fileName */
const store = new Map();

const listeners = new Set();

function notify() {
  const snapshot = getAllProblems();
  listeners.forEach(fn => {
    try { fn(snapshot); } catch (e) { console.error('[ProblemsStore] listener error', e); }
  });
}

/**
 * Replace diagnostics for one file.
 * @param {string} fileKey - uri or filename
 * @param {string} fileName
 * @param {string} [fileUri]
 * @param {ProblemItem[]} problems
 */
export function setFileProblems(fileKey, fileName, fileUri, problems) {
  const key = fileKey || fileName;
  if (!problems || problems.length === 0) {
    if (store.has(key)) {
      store.delete(key);
      notify();
    }
    return;
  }
  store.set(key, {
    fileUri: fileUri || fileKey || '',
    fileName: fileName || key,
    problems: problems.map(p => ({
      type: p.type === 'warning' ? 'warning' : (p.type === 'info' ? 'info' : 'error'),
      row: p.row ?? 0,
      column: p.column ?? 0,
      text: p.text || p.message || ''
    })),
    updatedAt: Date.now()
  });
  notify();
}

export function clearFileProblems(fileKey) {
  if (store.has(fileKey)) {
    store.delete(fileKey);
    notify();
  }
}

export function clearAllProblems() {
  if (store.size === 0) return;
  store.clear();
  notify();
}

export function getAllProblems() {
  const files = [];
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  for (const entry of store.values()) {
    files.push({ ...entry, problems: [...entry.problems] });
    for (const p of entry.problems) {
      if (p.type === 'error') errors++;
      else if (p.type === 'warning') warnings++;
      else infos++;
    }
  }

  // Newest first
  files.sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    files,
    summary: {
      files: files.length,
      errors,
      warnings,
      infos,
      total: errors + warnings + infos
    }
  };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
