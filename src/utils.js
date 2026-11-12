// src/utils.js
const Url = acode.require('Url');
const fsOperation = acode.require('fsOperation');
const toast = acode.require('toast');

export function resolveAlpinePath(fileUri) {
    let realPath = '';
    try {
        if (fileUri.startsWith('content://com.termux.documents')) {
            realPath = fileUri.split('::')[1];
            if (!realPath) throw new Error("Invalid Termux URI.");
        } else {
            const fs = fsOperation(fileUri);
            realPath = fs?._path || (fileUri.startsWith('file://') ? decodeURIComponent(fileUri.substring(7)) : fileUri);
        }
        if (!realPath) throw new Error("Could not determine file's real path.");

        const dirPathReal = Url.dirname(realPath);
        const filename = Url.basename(realPath);

        let alpineDirPath = '';
        
        // 🚀 ফিক্স: Termux-এর পাথকে /home-এ কনভার্ট না করে সরাসরি অরিজিনাল পাথ পাঠানো হচ্ছে
        if (dirPathReal.startsWith('/data/data/com.termux/files/home')) {
            alpineDirPath = dirPathReal; 
        } else if (dirPathReal.startsWith('/storage/emulated/0')) {
            alpineDirPath = '/sdcard' + dirPathReal.substring('/storage/emulated/0'.length);
        } else {
            alpineDirPath = dirPathReal; // Fallback
        }

        const alpineFilePath = Url.join(alpineDirPath, filename);
        
        return { dir: alpineDirPath, file: alpineFilePath, name: filename };

    } catch (e) {
        console.error("Path resolve error:", e);
        toast(`Error resolving path: ${e.message}`);
        return null;
    }
}