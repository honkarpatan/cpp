// src/terminalManager.js
const terminal = acode.require('terminal');
const toast = acode.require('toast');

const TERMINAL_NAME = 'C/C++ Terminal';
const STORAGE_KEY = 'cpp_plugin_terminal_id';

let sharedTerminalId = null;

/**
 * Normalize Executor output — after Acode updates it may return string or {stdout,stderr}.
 */
function normalizeExecOutput(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    const out = [raw.stdout, raw.stderr, raw.output, raw.message]
      .filter(Boolean)
      .join('\n');
    return out || String(raw);
  }
  return String(raw);
}

/**
 * Escape for single-quoted shell string (Python alpineExec style).
 */
export function shellEscapeSh(s) {
  return String(s).replace(/'/g, `'\"'\"'`);
}

/**
 * Alpine init does `exec <command>` — first token must be a real binary.
 * Always wrap as: sh -c '…'  (same as Python Tools / PHP plugin).
 */
export function wrapSh(script) {
  const s = String(script || '').trim();
  if (!s) return "sh -c 'true'";
  if (/^sh\s+-c\s+/i.test(s)) return s;
  return `sh -c '${shellEscapeSh(s)}'`;
}

/**
 * Execute command in background (no visible terminal).
 * Always returns a string (never throws on non-zero exit if caller wraps with || true).
 */
export async function executeCommand(command, isAlpine = true) {
  try {
    const cleanCmd = command?.trim();
    if (!cleanCmd) return '';

    const executor = window.Executor || terminal?.Executor || globalThis.Executor;
    if (!executor || typeof executor.execute !== 'function') {
      console.error('[Terminal] Executor API not found');
      toast('Error: Acode Executor API missing', 3000);
      throw new Error('Executor API missing');
    }

    // CRITICAL: pipelines / && need sh -c; bare `echo a | b` is unreliable under proot exec
    const wrapped = wrapSh(cleanCmd);
    console.log(`[Exec] Running: ${wrapped.slice(0, 180)}${wrapped.length > 180 ? '…' : ''} (Alpine: ${isAlpine})`);

    try {
      const raw = await executor.execute(wrapped, isAlpine);
      const output = normalizeExecOutput(raw);
      if (output) {
        console.log(`[Exec] Output (${output.length} chars):`, output.slice(0, 500));
      } else {
        console.log('[Exec] Output: (empty)');
      }
      return output;
    } catch (execErr) {
      // Executor rejects on non-zero exit — still extract stderr/message
      const msg = normalizeExecOutput(execErr) || (execErr?.message || String(execErr));
      console.warn('[Exec] Command exited non-zero / rejected:', msg.slice(0, 500));
      return msg;
    }
  } catch (err) {
    console.error(`[Exec] Failed: ${command}`, err);
    throw err;
  }
}

/**
 * Get or create the shared interactive Alpine terminal.
 */
export async function getSharedTerminal(name = TERMINAL_NAME) {
  // 1. In-memory cache
  if (sharedTerminalId && terminal.get(sharedTerminalId)) {
    return terminal.get(sharedTerminalId);
  }

  // 2. localStorage
  const savedId = localStorage.getItem(STORAGE_KEY);
  if (savedId) {
    const existingTerm = terminal.get(savedId);
    if (existingTerm) {
      console.log(`[Terminal] Reusing from storage: ${savedId}`);
      sharedTerminalId = savedId;
      return existingTerm;
    }
    localStorage.removeItem(STORAGE_KEY);
    sharedTerminalId = null;
  }

  // 3. Search by name
  try {
    const all = terminal.getAll();
    if (all) {
      for (const [id, termInfo] of all.entries()) {
        if (termInfo && (termInfo.name === name || termInfo.name === 'C/C++ Service')) {
          sharedTerminalId = id;
          localStorage.setItem(STORAGE_KEY, id);
          return terminal.get(id);
        }
      }
    }
  } catch (err) {
    console.error('[Terminal] Error searching existing:', err);
  }

  // 4. Create new server terminal (Alpine)
  console.log(`[Terminal] Creating new: ${name}`);
  try {
    const term = await terminal.createServer({ name });
    sharedTerminalId = term.id;
    localStorage.setItem(STORAGE_KEY, sharedTerminalId);
    // Give shell a moment to start
    await new Promise(resolve => setTimeout(resolve, 400));
    return term;
  } catch (createErr) {
    console.error('[Terminal] Create failed:', createErr);
    toast('Error: Could not create terminal.', 4000);
    throw createErr;
  }
}

/**
 * Write command to a specific terminal by id (preferred).
 */
export function writeToTerminal(termId, command) {
  if (!termId) {
    console.error('[Terminal] writeToTerminal: no id');
    return false;
  }
  const cmdToRun =
    command.endsWith('\r') || command.endsWith('\n') ? command : command + '\r';
  try {
    terminal.write(termId, cmdToRun);
    console.log('[Terminal] Wrote to', termId, ':', cmdToRun.trim().slice(0, 120));
    return true;
  } catch (err) {
    console.error('[Terminal] write failed:', err);
    return false;
  }
}

/**
 * Write command to the shared terminal (creates if needed).
 */
export async function writeShared(command) {
  try {
    const term = await getSharedTerminal();
    if (term && term.id) {
      return writeToTerminal(term.id, command);
    }
    console.error('[Terminal] Write failed: Terminal unavailable.');
    toast('Terminal Error: Cannot write command.', 3000);
    return false;
  } catch (err) {
    console.error('[Terminal] Error in writeShared:', err);
    return false;
  }
}

export function closeShared() {
  const idToClose = sharedTerminalId || localStorage.getItem(STORAGE_KEY);
  if (idToClose) {
    try {
      if (terminal.get(idToClose)) terminal.close(idToClose);
    } catch (_) {}
  }
  sharedTerminalId = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function getSharedTerminalId() {
  return sharedTerminalId || localStorage.getItem(STORAGE_KEY) || null;
}

/**
 * Escape for single-quoted shell string.
 */
export function shellEscape(s) {
  return String(s).replace(/'/g, `'\"'\"'`);
}

export function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Write a command into the shared interactive terminal (visible).
 */
export async function runCommand(command) {
  try {
    await writeShared(command);
  } catch (err) {
    console.error('[Terminal] runCommand failed:', err);
  }
}
