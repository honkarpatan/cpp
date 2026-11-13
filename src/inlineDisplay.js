// src/inlineDisplay.js
import { getSettings } from './settings.js';

let popupElement = null;
function createPopupElement() {
    if (popupElement) return popupElement;
    popupElement = document.createElement('div');
    popupElement.className = 'acode-c-inline-popup'; 
    popupElement.style.cssText = `
        position: fixed;
        z-index: 999;
        background: rgba(30, 30, 30, 0.55);
        color: #ff5252;
        padding: 5px 10px;
        border-radius: 4px 4px 4px 0px;
        font-family: monospace;
        font-size: 0.65em;
        pointer-events: none;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        border: 1px solid #444;
        white-space: pre-wrap;
        max-width: 80vw;
    `;
    document.body.appendChild(popupElement);
    return popupElement;
}

export function hidePopup() {
    if (popupElement && popupElement.style.display !== 'none') {
        popupElement.style.display = 'none';
    }
}

let currentLogMap = new Map();
let renderTimeout = null;

export function updateLogMap(newLogMap) {
    currentLogMap = newLogMap;
    requestRenderLogs();
}

function requestRenderLogs() {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
        const editor = editorManager.editor;
        if (editor) {
            insertVisibleLogs(editor, currentLogMap);
        }
    }, 150);
}

// =======================================
// 🎨 CM6 NATIVE GUTTER BACKGROUND COLORING
// =======================================
function clearGutterBackgrounds() {
    const lineGutterElements = document.querySelectorAll('.cm-lineNumbers .cm-gutterElement');
    if (lineGutterElements.length === 0) return; // Safely ignore in Ace
    lineGutterElements.forEach(el => {
        el.style.backgroundColor = '';
        el.style.color = '';
        el.style.borderRight = '';
        el.style.fontWeight = '';
    });
}

function applyGutterBackgrounds(logMap) {
    clearGutterBackgrounds();
    const lineGutterElements = document.querySelectorAll('.cm-lineNumbers .cm-gutterElement');
    if (lineGutterElements.length === 0) return;
    
    lineGutterElements.forEach(el => {
        const lineNum = parseInt(el.textContent);
        if (!isNaN(lineNum)) {
            const zeroBasedLine = lineNum - 1;
            
            if (logMap.has(zeroBasedLine)) {
                const logs = logMap.get(zeroBasedLine);
                const isError = logs.some(l => l.type === 'error');
                
                el.style.backgroundColor = isError ? 'rgba(255, 82, 82, 0.2)' : 'rgba(255, 202, 40, 0.2)';
                el.style.color = isError ? '#ff5252' : '#ffca28';
                el.style.borderRight = `3px solid ${isError ? '#ff5252' : '#ffca28'}`;
                el.style.fontWeight = 'bold';
            }
        }
    });
}
// =======================================

function clearPreviousLogs() {
    document.querySelectorAll('.acode-c-inline-log').forEach(el => el.remove());
    hidePopup();
    clearGutterBackgrounds(); 
}

function applyColors(element, logType) {
    const type = logType || 'default';
    let textColor = "#fff3cd"; 
    let bgColor = "#856404b0";

    if (type === "error") {
        textColor = "#f8d7da";
        bgColor = "#721c24b0";
    }
    
    element.style.color = textColor;
    element.style.backgroundColor = bgColor;
}

function insertVisibleLogs(editor, logMap) {
    clearPreviousLogs();
    if (!editor || !logMap || logMap.size === 0) {
        return;
    }

    const isCM6 = typeof editor.dispatch === 'function';

    // 🚀 CM6 এর জন্য শুধুমাত্র Gutter Background
    if (isCM6) {
        applyGutterBackgrounds(logMap);
        return;
    }

    // 🐢 Ace Editor এর জন্য ভাসমান বক্স এবং পপআপ
    const renderer = editor.renderer;
    if (!renderer) return;

    let firstVisibleRow = renderer.getFirstVisibleRow();
    let lastVisibleRow = renderer.getLastVisibleRow();
    let cursorPos = editor.getCursorPosition();

    let showPopupForLine = -1;
    let popupScreenPos = { pageX: 0, pageY: 0 };

    for (let lineNo = firstVisibleRow; lineNo <= lastVisibleRow; lineNo++) {
        const logs = logMap.get(lineNo);
        if (!Array.isArray(logs) || logs.length === 0) continue;

        const lineContent = editor.session.getLine(lineNo) || "";
        const isCursorAtEnd = (lineNo === cursorPos.row && cursorPos.column >= lineContent.trimEnd().length);

        if (isCursorAtEnd) {
            const coords = renderer.textToScreenCoordinates(lineNo, cursorPos.column);
            popupScreenPos = { pageX: coords.pageX, pageY: coords.pageY };
            showPopupForLine = lineNo;
            continue;
        }

        const coords = renderer.textToScreenCoordinates(lineNo, lineContent.length);
        const wrapper = document.createElement("span");
        wrapper.className = "acode-c-inline-log";
        wrapper.style.cssText = `
          pointer-events: none; user-select: none;
          font-style: italic; opacity: 0.85;
          border-radius: 3px; padding: 2px 6px;
          position: fixed; z-index: 50; font-size: 0.5em;
        `;

        const firstLog = logs[0];
        let msg = String(firstLog.output).replace(/[\r\n]+/g, ' ↵ ').trim();
        if (msg.length > 80) msg = msg.substring(0, 80) + '...';
        wrapper.textContent = ` ${msg} `;

        applyColors(wrapper, firstLog.type);

        const charWidth = renderer.characterWidth || 8;
        wrapper.style.top = `${coords.pageY}px`;
        wrapper.style.left = `${coords.pageX + charWidth + 10}px`;
        document.body.appendChild(wrapper);
    }

    if (showPopupForLine !== -1) {
        const logsForPopup = logMap.get(showPopupForLine);
        if (logsForPopup && logsForPopup.length > 0) {
            const popup = createPopupElement();
            const fullContent = logsForPopup.map(log => `[${log.type || 'log'}] ${log.output}`).join("\n");
            
            const isWarning = logsForPopup[0].type === 'warning';
            popup.style.color = isWarning ? '#ffca28' : '#ff5252';
            popup.style.borderColor = isWarning ? '#ffca28' : '#ff5252';

            popup.textContent = fullContent;
            popup.style.display = 'block'; 
            
            let top = popupScreenPos.pageY - 35;
            let left = popupScreenPos.pageX + 10;
            popup.style.top = `${top}px`;
            popup.style.left = `${left}px`;
        } else {
            hidePopup();
        }
    } else {
        hidePopup();
    }
}

export function handleEditorUpdate() { requestRenderLogs(); }
export function clearAllLogs() {
    currentLogMap = new Map();
    clearPreviousLogs();
}