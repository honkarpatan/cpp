// src/formatter.js
import plugin from '../plugin.json';
import { getSettings } from './settings.js';

// 1. Import the Wasm formatter package
import init, { format } from "@wasm-fmt/clang-format";

const loader = acode.require('loader');
const toast = acode.require('toast');

let wasmInitialized = false;
let baseUrl = '';

/**
 * Helper function to set editor value while preserving undo history.
 * Supports BOTH Ace Editor and CodeMirror 6.
 */
function setValueToEditor(activeFile, formattedCode) {
  const editor = editorManager.editor;
  const isCM6 = editor && typeof editor.dispatch === 'function';

  if (isCM6) {
    // --- CodeMirror 6 Logic ---
    const currentCode = editor.state.doc.toString();
    if (currentCode !== formattedCode) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: formattedCode }
      });
    }
  } else {
    // --- Ace Editor Logic ---
    const session = activeFile.session;
    const { $undoStack, $redoStack, $rev, $mark } = Object.assign(
      {},
      session.getUndoManager()
    );
    session.setValue(formattedCode);
    const undoManager = session.getUndoManager();
    undoManager.$undoStack = $undoStack;
    undoManager.$redoStack = $redoStack;
    undoManager.$rev = $rev;
    undoManager.$mark = $mark;
  }
}

/**
 * Initializes the C/C++ formatter
 */
export function initFormatter(_baseUrl) {
  // Save the base URL to find the .wasm file
  baseUrl = _baseUrl;

  // Register the formatter
  acode.registerFormatter(plugin.id, ["c", "cpp", "cxx", "cc", "h", "hpp"], async () => {
    try {
      // 1. Ensure Wasm module is loaded
      if (!wasmInitialized) {
        loader.showTitleLoader();
        console.log("[FORMATTER] Initializing Wasm module...");
        // This MUST point to where you've copied the .wasm file
        const wasmUrl = `${baseUrl}clang-format.wasm`; 
        await init(wasmUrl);
        wasmInitialized = true;
        console.log("[FORMATTER] Wasm module loaded.");
      }
      
      const { editor, activeFile } = editorManager;
      const settings = getSettings();
      
      // Determine if we are using CM6 or Ace to safely get the code
      const isCM6 = editor && typeof editor.dispatch === 'function';
      const code = isCM6 ? editor.state.doc.toString() : editor.getValue();
      
      // --- START: ADVANCED STYLE LOGIC ---
      let style;
      if (settings.clangFormatCustom && settings.clangFormatCustom.trim() !== '') {
        // 2. Use the custom style if it exists
        style = settings.clangFormatCustom;
        console.log("[FORMATTER] Using custom format style.");
      } else {
        // 3. Otherwise, use the preset
        style = settings.clangFormatStyle || 'Google';
        console.log(`[FORMATTER] Using preset format style: ${style}`);
      }
      // --- END: ADVANCED STYLE LOGIC ---
      
      loader.showTitleLoader();

      // 4. Run the Wasm formatter
      const formattedCode = format(
        code,      // The code string
        activeFile.filename || "main.cpp", // Use real filename
        style      // The style string (preset or custom JSON/YAML)
      );

      // 5. Set the new formatted code in the editor safely
      setValueToEditor(activeFile, formattedCode);
      
      loader.removeTitleLoader();
      window.toast("Formatted 🎉");

    } catch (error) {
      loader.removeTitleLoader();
      console.error("[FORMATTER]", error);
      acode.alert("C/C++ Formatter Error", error.message || "An unknown error occurred.");
    }
  });
}

/**
 * Cleans up the formatter.
 */
export function destroyFormatter() {
  acode.unregisterFormatter(plugin.id);
}