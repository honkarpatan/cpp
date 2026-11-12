// src/virtualWorkspace.js
const Url = acode.require('Url');
const fsOperation = acode.require('fsOperation');

function getHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
}

function resolveSourcePath(fileUri) {
    if (!fileUri) return null;
    if (fileUri.startsWith('content://com.termux.documents')) {
        const parts = fileUri.split('::');
        if (parts.length >= 2 && parts[1]) return parts[1];
    }
    if (fileUri.startsWith('file://')) {
        return decodeURIComponent(fileUri.substring(7));
    }
    try {
        const op = fsOperation(fileUri);
        if (op && op._path) return op._path;
    } catch (_) {}
    return null;
}

function isTermuxPath(realPath) {
    return realPath && (
        realPath.startsWith('/data/data/com.termux/files/home') ||
        realPath.startsWith('/data/user/0/com.termux/files/home')
    );
}

export function shellEscape(str) {
    return String(str).replace(/'/g, "'\\''");
}

/** UTF-8 safe base64 — Alpine busybox has `base64 -d` */
export function toBase64(str) {
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch (_) {
        const bytes = new TextEncoder().encode(str);
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        return btoa(binary);
    }
}

/**
 * /tmp is writable inside Alpine proot.
 * /sdcard → Permission denied from Executor.
 * $HOME can differ between Executor and interactive terminal.
 *
 * RUN: write via interactive terminal (same shell user sees).
 * LINT: write+compile in one Executor sh -c (same session).
 */
export const WORKSPACE_ROOT = '/tmp/acode_cpp_ws';

export async function alpineSh(snippet) {
    const { executeCommand } = await import('./terminalManager.js');
    const wrapped = `sh -c '${shellEscape(snippet)}'`;
    return executeCommand(wrapped, true);
}

/**
 * Collect project metadata + file contents (Android-side read).
 * Does NOT write to Alpine — caller writes (terminal or Executor one-shot).
 */
export async function prepareProject(file, sessionValue, isLiveLint = false) {
    if (!file) {
        console.error('[Workspace] Invalid file object');
        return null;
    }

    // Unsaved / missing uri — still allow single-file compile from buffer
    const effectiveUri = file.uri || file.filename || 'untitled.cpp';
    const dirUri = file.uri ? Url.dirname(file.uri) : '';
    const fileName = Url.basename(file.filename || effectiveUri) || 'untitled.cpp';
    const projectHash = getHash(dirUri);

    const editor = window.editorManager?.editor;
    const isCM6 = !!(editor && typeof editor.dispatch === 'function');

    const realFilePath = resolveSourcePath(file.uri);
    const realDirPath = realFilePath
        ? realFilePath.substring(0, realFilePath.lastIndexOf('/')) || realFilePath
        : null;
    const fromTermux = isTermuxPath(realFilePath);

    const projectDir = `${WORKSPACE_ROOT}/${projectHash}`;

    console.log(
        `[Workspace] Prepare: ${fileName} | CM6=${isCM6} Termux=${fromTermux} | ${projectDir}`
    );

    let projectFiles = [];
    if (dirUri) {
        try {
            const sourceFs = fsOperation(dirUri);
            const files = await sourceFs.lsDir();
            const allowedExt = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'];
            projectFiles = files.filter(f =>
                allowedExt.some(ext => f.name.toLowerCase().endsWith(ext))
            );
        } catch (lsErr) {
            console.warn('[Workspace] lsDir failed:', lsErr?.message || lsErr);
            projectFiles = [{ name: fileName, url: file.uri || effectiveUri }];
        }
    } else {
        projectFiles = [{ name: fileName, url: file.uri || effectiveUri }];
    }

    if (!projectFiles.some(f => f.name === fileName)) {
        projectFiles.push({ name: fileName, url: file.uri || effectiveUri });
    }

    const fileContents = {};
    for (const f of projectFiles) {
        if (isLiveLint && f.name !== fileName && !/\.(h|hpp)$/i.test(f.name)) continue;

        if (f.name === fileName && sessionValue !== undefined) {
            fileContents[f.name] = sessionValue;
        } else {
            try {
                fileContents[f.name] = await fsOperation(f.url).readFile('utf8');
            } catch (readErr) {
                console.warn(`[Workspace] Could not read ${f.name}:`, readErr?.message || readErr);
            }
        }
    }

    if (sessionValue !== undefined && !fileContents[fileName]) {
        fileContents[fileName] = sessionValue;
    }

    return {
        projectHash,
        mainFileName: fileName,
        // Headers default to C++ flags only when extension is C++-like; .c → gcc
        isCpp: /\.(cpp|cxx|cc|c\+\+|hpp)$/i.test(fileName),
        isCM6,
        fromTermux,
        realDirPath,
        realFilePath,
        projectDir,
        shadowDir: projectDir,
        sdcardBridgePath: projectDir,
        fileContents,
        fileNames: Object.keys(fileContents)
    };
}

/** Back-compat alias */
export async function syncProjectToAlpine(file, sessionValue, isLiveLint = false) {
    return prepareProject(file, sessionValue, isLiveLint);
}
