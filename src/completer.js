// src/completer.js
import { keywords } from './keywords.js';
import { commonSnippets, cSnippets, cppSnippets } from './snippets.js';
import { getSettings } from './settings.js';

const fsOperation = acode.require('fs');
const toast = acode.require('toast');

const cmState = acode.require('@codemirror/state');
const cmAutocomplete = acode.require('@codemirror/autocomplete'); 

let lastFetchedSnippets = null;
let lastSnippetPath = null;
const identifierRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
const CUSTOM_SNIPPET_FILENAME = 'c_cpp_snippets.json';

const defaultSnippets = {
  c: [...commonSnippets, ...cSnippets],
  cpp: [...commonSnippets, ...cppSnippets]
};

// =======================================
// 🌐 COMMON SNIPPET FETCHER
// =======================================
async function getDynamicSnippets(language) {
  const settings = getSettings();
  if (!settings.enableCustomSnippets) {
    lastSnippetPath = null; 
    lastFetchedSnippets = defaultSnippets;
    return defaultSnippets[language]; 
  }

  const path = settings.customSnippetPath;
  if (!path) {
    lastSnippetPath = null;
    lastFetchedSnippets = defaultSnippets;
    return defaultSnippets[language];
  }

  if (path === lastSnippetPath && lastFetchedSnippets) {
    return lastFetchedSnippets[language];
  }

  try {
    const existsSnippetFile = await fsOperation(`${path}`, CUSTOM_SNIPPET_FILENAME).exists();
    if (existsSnippetFile) {
      const fileContent = await fsOperation(`${path}`, CUSTOM_SNIPPET_FILENAME).readFile("utf-8");
      if (!fileContent || fileContent.trim() === '') {
        lastFetchedSnippets = defaultSnippets;
        return defaultSnippets[language];
      }
      const parsed = JSON.parse(fileContent);
      if (!parsed.c || !parsed.cpp) {
        lastFetchedSnippets = defaultSnippets;
        return defaultSnippets[language];
      }
      lastFetchedSnippets = parsed; 
      return lastFetchedSnippets[language]; 
    } else {
      lastFetchedSnippets = defaultSnippets;
      return defaultSnippets[language];
    }
  } catch (err) {
    console.error("[COMPLETER] Error loading custom snippets:", err);
    lastFetchedSnippets = defaultSnippets;
    return defaultSnippets[language];
  }
}

// =======================================
// 🐢 ACE EDITOR COMPLETION SOURCE
// =======================================
export const cppCompleter = {
  identifierRegexps: [/[a-zA-Z_0-9$:\.#]+/],

  getCompletions: async function (editor, session, pos, prefix, callback) {
    const settings = getSettings();
    if (settings.pluginEnabled === false) {
      callback(null, []);
      return;
    }

    // Accept c_cpp, c, cpp modes — and fall back to filename
    const activeFile = editorManager.activeFile;
    const filename = activeFile?.filename || '';
    const mode = session?.getMode?.()?.$id || '';
    const isCppLike =
      /\.(c|cpp|cxx|cc|c\+\+|h|hpp|hh|hxx)$/i.test(filename) ||
      /c_cpp|mode\/c\b|mode\/cpp/i.test(mode);
    if (!isCppLike) {
      callback(null, []);
      return;
    }

    let allCompletions = [];
    const pfx = (prefix || '').toLowerCase();

    let languagesToLoad = ['cpp'];
    if (filename.endsWith('.c')) languagesToLoad = ['c'];
    else if (/\.(h|hpp|hh|hxx)$/i.test(filename)) languagesToLoad = ['c', 'cpp'];

    if (settings.enableKeywords !== false) {
      keywords.forEach(keyword => {
        if (pfx && !keyword.toLowerCase().startsWith(pfx)) return;
        allCompletions.push({
          caption: keyword,
          value: keyword,
          meta: 'keyword',
          score: 1000
        });
      });
    }

    if (settings.enableSnippets !== false) {
      let combinedSnippets = [];
      for (const lang of languagesToLoad) {
        combinedSnippets.push(...(await getDynamicSnippets(lang)));
      }
      const uniqueSnippets = Array.from(
        new Map(combinedSnippets.map(s => [s.caption, s])).values()
      );
      uniqueSnippets.forEach(s => {
        const cap = String(s.caption || '');
        if (pfx && !cap.toLowerCase().startsWith(pfx)) return;
        allCompletions.push({
          caption: cap,
          snippet: s.snippet || s.value || cap,
          meta: s.meta || 'snippet',
          score: 1100
        });
      });
    }

    if (settings.enableIdentifiers) {
      const content = session.getValue();
      const words = new Set(content.match(identifierRegex) || []);
      const identifierCompletions = [];
      words.forEach(word => {
        if (word !== prefix) {
          identifierCompletions.push({
            caption: word,
            value: word,
            meta: "variable",
            score: 500,
          });
        }
      });
      allCompletions.push(...identifierCompletions);
    }

    callback(null, allCompletions);
  },
};

/** Strip tabstops for plain text insert fallback */
function snippetToPlain(snippet) {
  return String(snippet || '')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '');
}

/** Ace/VSCode ${1:name} → CM6-friendly placeholders */
function toCm6SnippetTemplate(raw) {
  return String(raw || '')
    .replace(/\$\{(\d+):([^}]*)\}/g, (_, _n, def) => `\${${def || 'arg'}}`)
    .replace(/\$\{(\d+)\}/g, '${}')
    .replace(/\$(\d+)/g, '${}');
}

// =======================================
// 🚀 CM6 COMPLETION SOURCE (pydbg-style)
// =======================================
export async function cm6CompletionSource(context) {
  try {
    const settings = getSettings();
    if (settings.pluginEnabled === false) return null;

    const activeFile = editorManager.activeFile;
    const filename = activeFile?.filename || '';
    if (!/\.(c|cpp|cxx|cc|c\+\+|h|hpp|hh|hxx)$/i.test(filename)) return null;

    const word = context.matchBefore(/[a-zA-Z_0-9#]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const pfx = (word.text || '').toLowerCase();
    let languagesToLoad = ['cpp'];
    if (filename.endsWith('.c')) languagesToLoad = ['c'];
    else if (/\.(h|hpp|hh|hxx)$/i.test(filename)) languagesToLoad = ['c', 'cpp'];

    const options = [];

    if (settings.enableKeywords !== false) {
      keywords.forEach(kw => {
        if (pfx && !kw.toLowerCase().startsWith(pfx)) return;
        options.push({ label: kw, type: 'keyword', boost: 10 });
      });
    }

    if (settings.enableSnippets !== false) {
      let combinedSnippets = [];
      for (const lang of languagesToLoad) {
        combinedSnippets.push(...(await getDynamicSnippets(lang)));
      }
      const uniqueSnippets = Array.from(
        new Map(combinedSnippets.map(s => [s.caption, s])).values()
      );

      for (const s of uniqueSnippets) {
        const cap = String(s.caption || '');
        if (pfx && !cap.toLowerCase().startsWith(pfx)) continue;
        const raw = s.snippet || s.value || cap;
        const cmTpl = toCm6SnippetTemplate(raw);
        try {
          if (typeof cmAutocomplete?.snippetCompletion === 'function') {
            options.push(
              cmAutocomplete.snippetCompletion(cmTpl, {
                label: cap,
                detail: s.meta || 'snippet',
                type: 'text',
                boost: 50
              })
            );
            continue;
          }
          if (typeof cmAutocomplete?.snippet === 'function') {
            options.push({
              label: cap,
              detail: s.meta || 'snippet',
              type: 'text',
              boost: 50,
              apply: cmAutocomplete.snippet(cmTpl)
            });
            continue;
          }
        } catch (e) {
          console.warn('[COMPLETER] snippet apply', e);
        }
        options.push({
          label: cap,
          detail: s.meta || 'snippet',
          type: 'text',
          boost: 50,
          apply: snippetToPlain(raw)
        });
      }
    }

    if (settings.enableIdentifiers !== false) {
      const content = context.state.doc.toString();
      const words = new Set(content.match(identifierRegex) || []);
      words.forEach(w => {
        if (w === word.text) return;
        if (pfx && !w.toLowerCase().startsWith(pfx)) return;
        options.push({ label: w, type: 'variable', boost: 5 });
      });
    }

    if (!options.length) return null;
    return {
      from: word.from,
      options,
      validFor: /^[a-zA-Z_0-9#]*$/
    };
  } catch (e) {
    console.warn('[COMPLETER] CM6 source', e);
    return null;
  }
}

// =======================================
// 🔌 HYBRID INJECTION LOGIC (ACE + CM6)
// =======================================
let completerCompartment = null;

export function registerAcodeCompleter() {
  const editor = editorManager.editor;

  if (!editor) {
    setTimeout(registerAcodeCompleter, 500);
    return;
  }

  const isCM6 = typeof editor.dispatch === 'function';

  if (isCM6) {
    if (!cmState || !cmAutocomplete || !editor.state) {
      console.warn('[COMPLETER] CM6 modules or editor.state missing — retry');
      setTimeout(registerAcodeCompleter, 800);
      return;
    }

    if (!completerCompartment) {
      completerCompartment = new cmState.Compartment();
    }

    const langData = cmState.EditorState?.languageData || cmState.languageData;
    let snippetExtension;
    if (langData && typeof langData.of === 'function') {
      snippetExtension = langData.of(() => [{ autocomplete: cm6CompletionSource }]);
    } else if (typeof cmAutocomplete.autocompletion === 'function') {
      snippetExtension = cmAutocomplete.autocompletion({
        override: [cm6CompletionSource]
      });
    } else {
      console.error('[COMPLETER] No CM6 autocompletion API');
      return;
    }

    try {
      const existingValue = completerCompartment.get(editor.state);
      if (existingValue === undefined) {
        editor.dispatch({
          effects: cmState.StateEffect.appendConfig.of(
            completerCompartment.of(snippetExtension)
          )
        });
        console.log('[COMPLETER] CM6 languageData injected');
      } else {
        editor.dispatch({
          effects: completerCompartment.reconfigure(snippetExtension)
        });
        console.log('[COMPLETER] CM6 reconfigured');
      }
    } catch (e) {
      console.error('[COMPLETER] CM6 inject failed:', e);
    }
  } else {
    if (!editor.completers) editor.completers = [];
    if (!editor.completers.includes(cppCompleter)) {
      editor.completers.unshift(cppCompleter);
      console.log('[COMPLETER] Ace completer injected');
    }
  }
}

// =======================================
// 🧹 CLEANUP & REMOVAL
// =======================================
export function clearSnippetCache() {
  lastFetchedSnippets = null;
  lastSnippetPath = null;
}

export function removeCompleter() {
    const editor = editorManager.editor;
    if (!editor) return;

    const isCM6 = typeof editor.dispatch === 'function';

    if (isCM6) {
        if (editor.state && completerCompartment) {
            const existingValue = completerCompartment.get(editor.state);
            if (existingValue !== undefined) {
                try {
                    editor.dispatch({
                        effects: completerCompartment.reconfigure([]) 
                    });
                } catch (e) {}
            }
        }
    } else {
        if (editor.completers) {
            const idx = editor.completers.indexOf(cppCompleter);
            if (idx !== -1) {
                editor.completers.splice(idx, 1);
            }
        }
    }
    clearSnippetCache();
}