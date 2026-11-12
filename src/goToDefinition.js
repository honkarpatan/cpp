// src/goToDefinition.js
import { adaptEditor } from './adaptEditor.js'; 
import { getSettings } from './settings.js';

const toast = acode.require('toast');
const fs = acode.require('fs');
const Url = acode.require('Url');
const EditorFile = acode.require('EditorFile');

// 🚀 স্মার্ট ওয়ার্ড ডিটেকশন (CM6 ও Ace এর জন্য পারফেক্ট ফিক্স)
function getWordUnderCursor(editorRaw, isCM6) {
    if (isCM6) {
        try {
            const state = editorRaw.state;
            const sel = state.selection.main;
            
            // ১. যদি ইউজার নিজে থেকে কোনো টেক্সট সিলেক্ট করে থাকে (সবার আগে অগ্রাধিকার)
            if (sel.from !== sel.to) {
                const selectedText = state.sliceDoc(sel.from, sel.to);
                if (selectedText && selectedText.trim() !== '') return selectedText;
            }
            
            // ২. যদি শুধু কার্সর থাকে, তবে ওই পজিশনের শব্দটা নাও
            let word = state.wordAt(sel.head);
            
            // ৩. যদি কার্সর শব্দের একদম শেষে থাকে (যেখানে wordAt null দেয়), তবে এক ঘর আগে চেক করো
            if (!word && sel.head > 0) {
                word = state.wordAt(sel.head - 1);
            }
            
            return word ? word.text : null;
        } catch (e) { 
            console.error("[GoToDef] CM6 extraction error:", e);
            return null; 
        }
    } else {
        try {
            // ১. Ace এ যদি সিলেক্ট করা থাকে
            const selectedText = editorRaw.getSelectedText();
            if (selectedText && selectedText.trim() !== '') {
                return selectedText;
            }
            
            // ২. শুধু কার্সর থাকলে
            const pos = editorRaw.getCursorPosition();
            const session = editorRaw.session;
            const range = session.getWordRange(pos.row, pos.column);
            return session.getTextRange(range);
        } catch (e) { 
            return null; 
        }
    }
}

function findDefinitionRow(content, targetWord, isCurrentFile, cursorRow) {
    const lines = content.split('\n');
    
    const patterns = [
        { regex: new RegExp(`(?:[a-zA-Z_][a-zA-Z0-9_<>]*)\\s+[\\*&\\s]*(?:[a-zA-Z_][a-zA-Z0-9_]*::)?${targetWord}\\s*\\(`), type: 'func' },
        { regex: new RegExp(`(?:class|struct|enum|union)\\s+${targetWord}\\s*(?:\\{|:|$)`), type: 'struct' },
        { regex: new RegExp(`^\\s*#define\\s+${targetWord}(?:\\s|\\(|$)`), type: 'macro' },
        { regex: new RegExp(`(?:[a-zA-Z_][a-zA-Z0-9_]*::)${targetWord}\\s*\\(`), type: 'constructor' },
        { regex: new RegExp(`(?:^|\\s|\\()(?:(?:const|volatile|static|auto|register|extern|unsigned|signed|long|short)\\s+)*([a-zA-Z_][a-zA-Z0-9_<>:]+)\\s+[\\*&\\s]*${targetWord}\\s*(?:[;=\\[\\,\\)]|$)`), type: 'var' }
    ];

    for (let i = 0; i < lines.length; i++) {
        if (isCurrentFile && i === cursorRow) continue; 

        const line = lines[i];
        if (!line.includes(targetWord)) continue; 
        
        for (const p of patterns) {
            if (p.regex.test(line)) {
                if (p.type === 'func') {
                    const equalIdx = line.indexOf('=');
                    const wordIdx = line.indexOf(targetWord);
                    if (equalIdx !== -1 && equalIdx < wordIdx) continue;
                    if (/^\s*return\s+/.test(line)) continue;
                }
                
                if (p.type === 'var') {
                    const match = line.match(p.regex);
                    if (match) {
                        const typeName = match[1]; 
                        const invalidTypes = ['return', 'if', 'else', 'while', 'for', 'switch', 'case', 'goto', 'sizeof', 'new', 'delete', 'throw', 'catch'];
                        if (invalidTypes.includes(typeName)) continue;
                    }
                }
                
                return i; // 0-based index রিটার্ন করছে
            }
        }
    }
    return -1;
}

export async function executeGoToDefinition() {
    const settings = getSettings();
    if (!settings.enableGoToDefinition) return;
    
    console.log("[GoToDef] ====== Go To Definition Started ======");

    const editorRaw = editorManager?.editor;
    const activeFile = editorManager?.activeFile;
    
    if (!editorRaw || !activeFile) return;

    const isCM6 = typeof editorRaw.dispatch === 'function';
    const editor = adaptEditor(editorRaw);
    
    let targetWord = getWordUnderCursor(editorRaw, isCM6);
    
    if (!targetWord || targetWord.trim() === '') {
        toast('No valid symbol selected');
        return;
    }

    targetWord = targetWord.trim();
    console.log(`[GoToDef] Searching for: '${targetWord}'`);

    const cursorRow = editor.getCursorPosition().row;
    const currentFileContent = editor.session.getValue();

    // 1. কারেন্ট ফাইলে খুঁজুন
    console.log("[GoToDef] Scanning current file...");
    const localRow = findDefinitionRow(currentFileContent, targetWord, true, cursorRow);
    
    if (localRow !== -1) {
        console.log(`[GoToDef] Match found in current file at row: ${localRow}`);
        const jumpRow = isCM6 ? localRow : localRow + 1;
        editor.gotoLine(jumpRow, 0, true);
        toast('Found in current file!');
        return;
    }

    // 2. কারেন্ট ফাইলে না পেলে অন্যান্য ফাইলে খুঁজুন
    toast(`Searching ${targetWord} in siblings...`);
    const fileUri = activeFile.uri;
    if (fileUri) {
        const dirUri = Url.dirname(fileUri);
        console.log("[GoToDef] Scanning siblings in directory...");

        try {
            const dirFs = fs(dirUri);
            const files = await dirFs.lsDir();
            
            for (const f of files) {
                if (f.isFile && f.url !== fileUri && /\.(c|cpp|cc|cxx|h|hpp)$/i.test(f.name)) {
                    const siblingContent = await fs(f.url).readFile('utf8');
                    const targetRow = findDefinitionRow(siblingContent, targetWord, false, -1);
                    
                    if (targetRow !== -1) {
                        console.log(`[GoToDef] Match found in ${f.name} at row: ${targetRow}`);
                        toast(`Found in ${f.name}`);
                        
                        let existingFile = editorManager.getFile(f.url, "uri");
                        if (existingFile) {
                            existingFile.makeActive();
                        } else {
                            new EditorFile(f.name, { uri: f.url });
                        }
                        
                        setTimeout(() => {
                            const newEditorRaw = editorManager.editor;
                            if (!newEditorRaw) return;
                            const newIsCM6 = typeof newEditorRaw.dispatch === 'function';
                            const newEditor = adaptEditor(newEditorRaw);
                            
                            const jumpRow = newIsCM6 ? targetRow : targetRow + 1;
                            if (newEditor) newEditor.gotoLine(jumpRow, 0, true);
                        }, 500);
                        return;
                    }
                }
            }
        } catch (e) {
            console.error('[GoToDef] Error searching siblings:', e);
        }
    }

    console.warn(`[GoToDef] Definition not found for '${targetWord}'`);
    toast(`Definition not found for '${targetWord}'`);
}