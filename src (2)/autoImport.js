// src/autoImport.js (v3.3 - Fixed Dual Support Ace + CM6)
import { getSettings } from './settings.js';
import { getParser, getCppLanguage, getCLanguage, Query } from './treeSitterManager.js'; 
import { headerMap } from './headerMap.js';

const toast = acode.require('toast');
let initializationWarningShown = false; 

// C++ query
const CPP_QUERY_STRING = `
  (preproc_include path: (_) @include_path)
  (call_expression function: (identifier) @func_call)
  (call_expression function: (field_expression field: (field_identifier) @method_call))
  (type_identifier) @type_id
  (qualified_identifier) @qualified_id
  (identifier) @identifier
`;

// C query
const C_QUERY_STRING = `
  (preproc_include path: (_) @include_path)
  (call_expression function: (identifier) @func_call)
  (call_expression function: (field_expression field: (field_identifier) @method_call))
  (type_identifier) @type_id
  (identifier) @identifier
`;

function getEditorInfo() {
    const editor = editorManager.editor;
    const isCM6 = editor && typeof editor.dispatch === 'function';
    return { editor, isCM6 };
}

export async function analyzeAndImportHeaders(session) {
    const settings = getSettings(); 
    const { editor, isCM6 } = getEditorInfo();

    // 🚀 BUG FIX: Ace Editor এর জন্য session চেক হবে, কিন্তু CM6 এর জন্য session লাগবে না!
    if (!settings.enableTreeSitterAnalysis || !editorManager.activeFile) return;
    if (!isCM6 && !session) return; 
    if (!editor) return;

    const filename = editorManager.activeFile.filename;
    const parser = getParser(filename); 

    if (!parser) {
        if (!initializationWarningShown) {
            console.warn("[AutoImport] Analysis skipped: Parser not ready or language unsupported.");
            toast("AI code analysis is starting...", 2000);
            initializationWarningShown = true; 
        }
        return; 
    }
    initializationWarningShown = false;
    console.log("[AutoImport] Parser ready. Starting analysis for:", filename);

    // --- Helpers for Dual Support ---
    const getCode = () => isCM6 ? editor.state.doc.toString() : session.getValue();
    const getTotalLines = () => isCM6 ? editor.state.doc.lines : session.getLength();
    const getLineText = (rowIndex) => {
        if (isCM6) {
            if (rowIndex + 1 > editor.state.doc.lines) return ""; 
            return editor.state.doc.line(rowIndex + 1).text;
        }
        return session.getLine(rowIndex);
    };

    try {
        const code = getCode();
        const tree = parser.parse(code);
        const rootNode = tree.rootNode;

        const activeIncludes = new Map(); 
        const commentedIncludes = new Map();
        const potentialIdentifiers = new Set();
        const allManagedHeaders = new Set(Object.values(headerMap));

        // Find commented headers
        const totalLines = getTotalLines();
        const includeRegex = /^\s*\/\/\s*#include\s*([<"][^>"]+[>"])/; 

        for (let i = 0; i < totalLines; i++) {
            const lineContent = getLineText(i);
            const match = lineContent.match(includeRegex);
            if (match) {
                const headerName = match[1];
                if (allManagedHeaders.has(headerName)) {
                    commentedIncludes.set(headerName, i); 
                }
            }
        }

        // Find active headers and identifiers
        let language, queryString;
        if (/\.(cpp|cxx|cc|h|hpp)$/i.test(filename)) {
            language = getCppLanguage();
            queryString = CPP_QUERY_STRING;
        } else if (/\.c$/i.test(filename)) {
            language = getCLanguage();
            queryString = C_QUERY_STRING;
        } else {
            return; 
        }

        if (!language) {
            console.error("[AutoImport] Tree-sitter language object not loaded!");
            return;
        }

        const query = new Query(language, queryString);
        const captures = query.captures(rootNode);
        
        captures.forEach(capture => {
            const node = capture.node;
            const nodeText = node.text.trim();

            if (capture.name === 'include_path') {
                activeIncludes.set(nodeText, node.startPosition.row); 
            } else if (headerMap[nodeText]) {
                 potentialIdentifiers.add(nodeText);
            }
        });

        // Determine required headers
        const requiredStdHeaders = new Set();
        potentialIdentifiers.forEach(id => {
            if (headerMap[id]) requiredStdHeaders.add(headerMap[id]);
        });

        // Determine actions
        const headersToAdd = new Set();
        const linesToUncomment = [];
        const linesToComment = [];
        let editsMade = false; 

        // Uncomment logic
        requiredStdHeaders.forEach(header => {
            const altHeader = header.includes('<') ? header.replace('<', '"').replace('>', '"') : header.replace('"', '<').replace('"', '>');
            const isActive = activeIncludes.has(header) || activeIncludes.has(altHeader);
            const commentedLine = commentedIncludes.get(header) ?? commentedIncludes.get(altHeader);

            if (isActive) { /* do nothing */ }
            else if (commentedLine !== undefined) {
                linesToUncomment.push(commentedLine);
            } else {
                headersToAdd.add(header);
            }
        });

        // Comment logic
        if (settings.removeUnusedHeaders !== 'disable') { 
            activeIncludes.forEach((line, header) => {
                const altHeader = header.includes('<') ? header.replace('<', '"').replace('>', '"') : header.replace('"', '<').replace('"', '>');
                const isNeeded = requiredStdHeaders.has(header) || requiredStdHeaders.has(altHeader);
                
                if (!isNeeded && allManagedHeaders.has(header)) { 
                    linesToComment.push(line);
                }
            });
        }
        
        // --- Apply actions (Dual Support Logic) ---
        
        // Priority 1: Commenting or Removing
        if (settings.removeUnusedHeaders === 'comment' && linesToComment.length > 0) {
            linesToComment.sort((a, b) => b - a); 
            if (isCM6) {
                const changes = [];
                linesToComment.forEach(lineIdx => {
                    const cmLine = editor.state.doc.line(lineIdx + 1);
                    if (cmLine.text.trim().startsWith('#include')) {
                        changes.push({ from: cmLine.from, to: cmLine.to, insert: `// ${cmLine.text}` });
                    }
                });
                if (changes.length > 0) editor.dispatch({ changes });
            } else {
                linesToComment.forEach(lineIdx => {
                    const lineText = session.getLine(lineIdx).trim();
                    if (lineText.startsWith('#include')) {
                        const newText = `// ${lineText}`; 
                        const range = new ace.Range(lineIdx, 0, lineIdx, session.getLine(lineIdx).length); 
                        session.replace(range, newText);
                    }
                });
            }
            toast(`Commented out ${linesToComment.length} unused header(s).`, 1500);
            editsMade = true;
        } 
        else if (settings.removeUnusedHeaders === 'remove' && linesToComment.length > 0) {
            linesToComment.sort((a, b) => b - a); 
            if (isCM6) {
                const changes = [];
                linesToComment.forEach(lineIdx => {
                    const cmLine = editor.state.doc.line(lineIdx + 1);
                    if (cmLine.text.trim().startsWith('#include')) {
                        const to = cmLine.to + (cmLine.to < editor.state.doc.length ? 1 : 0);
                        changes.push({ from: cmLine.from, to: to });
                    }
                });
                if (changes.length > 0) editor.dispatch({ changes });
            } else {
                linesToComment.forEach(lineIdx => {
                    const lineText = session.getLine(lineIdx).trim();
                    if (lineText.startsWith('#include')) {
                        const range = new ace.Range(lineIdx, 0, lineIdx + 1, 0); 
                        session.replace(range, "");
                    }
                });
            }
            toast(`Removed ${linesToComment.length} unused header(s).`, 1500);
            editsMade = true;
        }
        
        // Priority 2: Uncommenting
        if (linesToUncomment.length > 0) {
            linesToUncomment.sort((a, b) => b - a); 
            if (isCM6) {
                const changes = [];
                linesToUncomment.forEach(lineIdx => {
                    const cmLine = editor.state.doc.line(lineIdx + 1);
                    const match = cmLine.text.trim().match(/^\s*\/\/\s*(#include\s*[<"][^>"]+[>"])/);
                    if (match) {
                        changes.push({ from: cmLine.from, to: cmLine.to, insert: match[1] });
                    }
                });
                if (changes.length > 0) editor.dispatch({ changes });
            } else {
                linesToUncomment.forEach(lineIdx => {
                    const lineText = session.getLine(lineIdx).trim();
                    const match = lineText.match(/^\s*\/\/\s*(#include\s*[<"][^>"]+[>"])/);
                    if (match) {
                        const newText = match[1];
                        const range = new ace.Range(lineIdx, 0, lineIdx, session.getLine(lineIdx).length);
                        session.replace(range, newText);
                    }
                });
            }
            toast(`Re-enabled ${linesToUncomment.length} existing header(s).`, 1500);
            editsMade = true;
        }
            
        // If edits were made, re-run analysis
        if (editsMade) {
            console.log("[AutoImport] Performed edits. Re-running analysis for additions...");
            setTimeout(() => analyzeAndImportHeaders(session), 100); 
            return; 
        }

        // Priority 3: Adding new headers
        if (headersToAdd.size > 0) {
            let currentLastIncludeLine = -1;
            const currentTree = parser.parse(getCode()); 
            const currentQuery = new Query(language, `(preproc_include path: (_) @include_path)`);
            const currentCaptures = currentQuery.captures(currentTree.rootNode);
            currentCaptures.forEach(capture => {
                if (capture.node.startPosition.row > currentLastIncludeLine) {
                    currentLastIncludeLine = capture.node.startPosition.row;
                }
            });

            let insertPos = { row: 0 };
            if (currentLastIncludeLine !== -1) {
                insertPos.row = currentLastIncludeLine + 1;
            } else {
                let firstCodeLine = 0;
                const newTotalLines = getTotalLines();
                for (let i = 0; i < newTotalLines; i++) {
                    const lineContent = getLineText(i).trim();
                    if (lineContent && !lineContent.startsWith('//') && !lineContent.startsWith('/*') && !lineContent.startsWith('#')) {
                        firstCodeLine = i; break;
                    }
                     if (lineContent.startsWith('#') && !lineContent.startsWith('#include')) {
                         firstCodeLine = i; break;
                     }
                }
                insertPos.row = firstCodeLine;
            }

            let textToInsert = "";
            const newline = (settings.autoImportNewlineStyle === 'spaced') ? "\n\n" : "\n";
            
            let needsLeadingNewline = (insertPos.row > 0 && getLineText(insertPos.row - 1)?.trim() !== "");
            if (getLineText(insertPos.row)?.trim() !== '') {
                 needsLeadingNewline = true;
            }
            
            if (needsLeadingNewline) {
                if (settings.autoImportNewlineStyle === 'spaced' && getLineText(insertPos.row - 1)?.trim() !== "") {
                     textToInsert += "\n"; 
                }
            }

            textToInsert += [...headersToAdd].map(header => `#include ${header}`).join(newline);

            if (getLineText(insertPos.row)?.trim() !== '') {
                 textToInsert += newline;
            }

            if (isCM6) {
                let cmInsertPos;
                if (insertPos.row < getTotalLines()) {
                    cmInsertPos = editor.state.doc.line(insertPos.row + 1).from;
                } else {
                    cmInsertPos = editor.state.doc.length;
                    if (!textToInsert.startsWith('\n')) textToInsert = '\n' + textToInsert; 
                }
                editor.dispatch({ changes: { from: cmInsertPos, insert: textToInsert } });
            } else {
                session.insert({ row: insertPos.row, column: 0 }, textToInsert);
            }

            toast(`Added includes: ${[...headersToAdd].join(', ')}`, 2000);
        } else {
            console.log("[AutoImport] No missing or unused standard headers detected.");
        }

    } catch (err) {
        console.error("[AutoImport] Tree-sitter analysis encountered an error:", err);
        toast("Auto-import analysis failed.", 3000);
    }
}