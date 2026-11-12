// src/modules/utils/adaptEditor.js
const Url = acode.require('Url');

/**
 * 🚀 Advanced Editor Adapter for C/CPP Plugin
 * Bridge between Ace and CodeMirror 6 (CM6)
 */
export function adaptEditor(editorRaw) {
    if (!editorRaw) return null;
    if (editorRaw._isAdapted) return editorRaw;

    // CM6 check: Acode CM6 editor-e 'state' ebong 'dispatch' thake
    const isCM6 = editorRaw.state && typeof editorRaw.dispatch === 'function';
    
    // Jodi Ace hoy, tobe context thik rekhe editor-i return korbe
    if (!isCM6) {
        editorRaw._isAdapted = true;
        return editorRaw;
    }

    // --- CM6 Logic Start ---
    const activeFile = window.editorManager?.activeFile;
    const filename = activeFile?.filename || '';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    
    // C/CPP mode selection logic
    let modeId = "javascript"; // Fallback
    if (['c', 'h'].includes(ext)) modeId = "c_cpp";
    else if (['cpp', 'cc', 'cxx', 'hpp'].includes(ext)) modeId = "c_cpp";

    return {
        _isAdapted: true,
        raw: editorRaw, // Original CM6 view object
        
        // 🎯 Cursor Position
        getCursorPosition() {
            try {
                const pos = editorRaw.state.selection.main.head;
                const line = editorRaw.state.doc.lineAt(pos);
                return { 
                    row: line.number - 1, 
                    column: pos - line.from 
                };
            } catch(e) { 
                return { row: 0, column: 0 }; 
            }
        },

        // 🎯 Jump to Line
        gotoLine(line, col = 0, animate = true) {
            try {
                const cmView = acode.require('@codemirror/view');
                const lineObj = editorRaw.state.doc.line(line + 1);
                const pos = lineObj.from + col;
                
                editorRaw.dispatch({
                    selection: { anchor: pos },
                    effects: [
                        cmView.EditorView.scrollIntoView(pos, { y: "center" })
                    ]
                });
            } catch(e) {
                console.error("[C/CPP Adapter] gotoLine error:", e);
            }
        },

        // 🎯 Session Mocking (Ace structure mimic)
        session: {
            // Line content read
            getLine(row) {
                try {
                    if (row < 0 || row >= editorRaw.state.doc.lines) return "";
                    return editorRaw.state.doc.line(row + 1).text;
                } catch(e) { return ""; }
            },

            // Total lines
            getLength() {
                return editorRaw.state.doc.lines;
            },

            // Full document value
            getValue() {
                return editorRaw.state.doc.toString();
            },

            // 🔍 Basic Tokenizer (Comments ebong Strings ignore korar jonno)
            getTokens(row) {
                try {
                    if (row < 0 || row >= editorRaw.state.doc.lines) return [];
                    const lineStr = editorRaw.state.doc.line(row + 1).text;
                    const tokens = [];
                    let cursor = 0;
                    
                    // C/CPP-er common syntax (Comments, Strings) regex
                    const regex = /(\/\/.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
                    let match;
                    
                    while ((match = regex.exec(lineStr)) !== null) {
                        if (match.index > cursor) {
                            tokens.push({ type: "text", value: lineStr.slice(cursor, match.index) });
                        }
                        let type = match[0].startsWith('/') ? "comment" : "string";
                        tokens.push({ type, value: match[0] });
                        cursor = regex.lastIndex;
                    }
                    
                    if (cursor < lineStr.length) {
                        tokens.push({ type: "text", value: lineStr.slice(cursor) });
                    }
                    return tokens;
                } catch(e) { 
                    return [{ type: "text", value: "" }]; 
                }
            },

            // Language Mode identification
            $modeId: `ace/mode/${modeId}`
        }
    };
}