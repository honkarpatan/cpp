// src/lspServer.js
const lsp = acode.require('lsp');
import { getSettings } from './settings.js';

export function registerClangdServer() {
    if (!lsp) {
        console.warn("[LSP] Acode LSP module not found. Clangd support is disabled.");
        return;
    }

    const settings = getSettings();

    // 🟢 CRITICAL HACK: Clangd-এর ডায়াগনস্টিকস (Errors) স্ক্রিনে দেখানো পুরোপুরি বন্ধ করে দেওয়া হলো!
    // এর ফলে Clangd ক্র্যাশ করবে না, কিন্তু ভুলভাল এররও দেখাবে না। 
    // আমাদের কাস্টম GCC লিন্টার একাই এরর দেখানোর কাজ করবে।
    if (lsp.clientManager) {
        lsp.clientManager.setOptions({
            diagnosticsUiExtension: [], // এটি CM6-এর ডিফল্ট LSP Error UI হাইড করে দেয়
        });
    }

    // 🟢 পাথ ট্রান্সলেশন (Path Translation)
    // Clangd যেন আমাদের Alpine-এর ভেতরের ফাইলগুলো ঠিকমতো রিড করতে পারে।
    function toAlpineUri(uri, fallbackUri) {
        if (typeof uri !== "string") return fallbackUri || null;
        // ভার্চুয়াল URI-কে ফিজিক্যাল Alpine Path-এ কনভার্ট করা
        if (uri.startsWith("content://")) {
            const fileName = uri.split('::').pop().split('/').pop();
            // আমরা আমাদের SD Card Bridge বা Shadow Directory-এর পাথ দিতে পারি
            return `file:///root/.acode_cpp_workspaces/${fileName}`; 
        }
        return fallbackUri || uri;
    }

    const clangdServer = lsp.defineServer({
        id: "clangd-cpp",
        label: "C/C++ (Clangd)",
        languages: ["c", "cpp", "cppcm"], 
        useWorkspaceFolders: true,
        command: "clangd",
        args: (settings.clangdArgs || "--background-index --suggest-missing-includes").split(" ").filter(Boolean),
        checkCommand: "command -v clangd",
        
        // 🟢 Acode-কে বলে দেওয়া হচ্ছে Clangd-এর সাথে কথা বলার সময় ফাইল পাথগুলো কীভাবে পাঠাতে হবে
        rootUri(uri, context) {
            return toAlpineUri(context.rootUri || uri, context.rootUri || null);
        },
        documentUri(uri, context) {
            return toAlpineUri(uri, context.normalizedUri);
        }
    });

    try {
        lsp.upsert(clangdServer);
        console.log("[LSP] Clangd Server Registered natively with Muted Diagnostics!");
    } catch (e) {
        console.error("[LSP] Error registering clangd:", e);
    }
}

export function unregisterClangdServer() {
    if (!lsp) return;
    try {
        lsp.servers.unregister("clangd-cpp");
        console.log("[LSP] Clangd Server Unregistered.");
    } catch (e) {
        console.error("[LSP] Error unregistering clangd:", e);
    }
}