// src/treeSitterManager.js
import { Parser, Language, Query } from 'web-tree-sitter';

let parser = null;
let cppLanguage = null;
let cLanguage = null; 
let isLoading = false;
let baseUrl = '';

/**
 * Initialize TreeSitter and load C/C++ grammars.
 */
export async function initializeTreeSitter(_baseUrl) {
    if (parser || isLoading) {
        return;
    }
    if (!_baseUrl) {
        console.error("[TreeSitter] Base URL is required for initialization.");
        return;
    }
    baseUrl = _baseUrl;
    isLoading = true;
    console.log("[TreeSitter] Initializing...");

    try {
        console.log("[TreeSitter] Calling Parser.init()...");
        await Parser.init(); 
        console.log("[TreeSitter] Parser.init() successful.");
        
        parser = new Parser(); 

        const cacheBust = `?t=${Date.now()}`;
        console.log(`[TreeSitter] Using Cache Bust key: ${cacheBust}`);

        // --- [!!!] START: FIX [!!!] ---
        // পরিবর্তিত নতুন ফাইলের নাম ব্যবহার করুন
        const cppWasmPath = `${baseUrl}ts-grammar-cpp.wasm${cacheBust}`;
        const cWasmPath = `${baseUrl}ts-grammar-c.wasm${cacheBust}`;
        // --- [!!!] END: FIX [!!!] ---

        
        console.log(`[TreeSitter] Loading C++ grammar from: ${cppWasmPath}`);
        console.log(`[TreeSitter] Loading C grammar from: ${cWasmPath}`);

        
        console.log("[TreeSitter] Calling Language.load() for C++...");
        cppLanguage = await Language.load(cppWasmPath);
        console.log("[TreeSitter] C++ language loaded.");


        console.log("[TreeSitter] Calling Language.load() for C...");
        cLanguage = await Language.load(cWasmPath);
        console.log("[TreeSitter] C language loaded.");
        
        console.log("[TreeSitter] Parsers ready!");
        isLoading = false;

    } catch (err) {
        console.error("[TreeSitter] Failed to initialize or load grammars:", err);
        console.error("[TreeSitter] Error Name:", err.name);
        console.error("[TreeSitter] Error Message:", err.message);
        console.error("[TreeSitter] Error Stack:", err.stack);
        parser = null; cppLanguage = null; cLanguage = null; isLoading = false;
        acode.alert("Tree-sitter Error", `Failed to load parsers: ${err.message}`);
    }
}

/**
 * Get the initialized TreeSitter parser instance AND set the correct language.
 * Returns null if not ready or language unknown.
 * @param {string} filename - The name of the file to determine the language.
 */
export function getParser(filename) {
    if (!parser || isLoading) {
        console.warn("[TreeSitter] getParser called but parser not ready or still loading.");
        return null;
    }

    let languageToUse = null;
    if (/\.(cpp|cxx|cc|h|hpp)$/i.test(filename)) {
        languageToUse = cppLanguage;
    } else if (/\.c$/i.test(filename)) {
        languageToUse = cLanguage;
    } else {
        console.warn(`[TreeSitter] Unknown language for file: ${filename}`);
        return null; 
    }

    if (!languageToUse) {
         console.warn(`[TreeSitter] Language module for ${filename} not loaded properly.`);
         return null;
    }

    try {
        parser.setLanguage(languageToUse);
        return parser;
    } catch (setLangErr) {
        console.error("[TreeSitter] Error setting language:", setLangErr);
        return null;
    }
}

/**
 * Helper to get the currently loaded C++ Language object for queries.
 */
export function getCppLanguage() {
    return cppLanguage;
}

/**
 * Helper to get the currently loaded C Language object for queries.
 */
export function getCLanguage() {
    return cLanguage;
}

export { Query }; // Query এক্সপোর্ট করুন