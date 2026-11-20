// src/customSnippets.js
import plugin from '../plugin.json';
// 1. Import the new snippet arrays
import { commonSnippets, cSnippets, cppSnippets } from './snippets.js';
import { getSettings } from './settings.js';

const appSettings = acode.require('settings');
const fileBrowser = acode.require('fileBrowser');
const fs = acode.require('fs');
const Url = acode.require('Url');
const toast = acode.require('toast');

const CUSTOM_SNIPPET_FILENAME = 'c_cpp_snippets.json';

// 2. Define the default structure for the JSON file
const defaultSnippetStructure = {
  c: [...commonSnippets, ...cSnippets],
  cpp: [...commonSnippets, ...cppSnippets]
};

/**
* Select or create a folder for custom snippets.
* Creates default snippet file if not found.
* Stores the path in settings (no localStorage).
* All file operations use backtick template literals as required by Acode `${Uri}`
*/
export async function selectCustomSnippetPath() {
  try {
    // Open folder picker
    const result = await fileBrowser('folder', 'Select folder for custom snippets');
    if (!result || result.type !== 'folder') {
      toast('Folder selection cancelled.');
      return;
    }

    const folderUrl = result.url;
    const snippetsFilePath = Url.join(folderUrl, CUSTOM_SNIPPET_FILENAME);

    // Check if the snippet file exists
    const existsFile = await fs(snippetsFilePath).exists();

    if (!existsFile) {
      // 3. Create the snippet file with the new C/C++ structure
      const content = JSON.stringify(defaultSnippetStructure, null, 2);
      
      await fs(`${folderUrl}`).createFile(CUSTOM_SNIPPET_FILENAME, content);
      toast(`✅ Created ${CUSTOM_SNIPPET_FILENAME}`);
    } else {
      toast(`📁 Found existing ${CUSTOM_SNIPPET_FILENAME}`);
    }

    // Save the folder path to settings (persistent)
    const settings = getSettings();
    settings.customSnippetPath = folderUrl;
    appSettings.update();
    toast(`Custom snippet folder saved successfully!`);

  } catch (err) {
    console.error('[SNIPPETS] Error selecting path:', err);
    toast(`❌ ${err.message || 'Failed to set snippet folder'}`);
  }
}

/**
* Read and return the snippets JSON structure { c: [], cpp: [] }.
*/
export async function readCustomSnippets() {
  try {
    const settings = getSettings();
    const folderUrl = settings.customSnippetPath;
    if (!folderUrl) throw new Error('Custom snippet path not set.');

    const fileUrl = Url.join(`${folderUrl}`, CUSTOM_SNIPPET_FILENAME);
    const existsFile = await fs(`${fileUrl}`).exists();
    if (!existsFile) throw new Error(`${CUSTOM_SNIPPET_FILENAME} not found.`);

    const content = await fs(`${fileUrl}`).readFile('utf-8');
    const parsed = JSON.parse(content || '{}');
    
    // 4. Validate the structure
    if (!parsed.c || !parsed.cpp) {
      throw new Error(`JSON missing 'c' or 'cpp' keys.`);
    }
    
    return parsed;
    
  } catch (err) {
    console.error('[SNIPPETS] Read error:', err);
    toast(`⚠️ Failed to read snippets: ${err.message}`);
    return defaultSnippetStructure; // fallback
  }
}

/**
* Save custom snippets to JSON file.
* @param {Object} data - snippet JSON object { c: [], cpp: [] } to write
*/
export async function saveCustomSnippets(data) {
  try {
    const settings = getSettings();
    const folderUrl = settings.customSnippetPath;
    if (!folderUrl) throw new Error('Snippet path not set.');

    const fileUrl = Url.join(`${folderUrl}`, CUSTOM_SNIPPET_FILENAME);
    const jsonStr = JSON.stringify(data, null, 2);

    await fs(`${folderUrl}`, CUSTOM_SNIPPET_FILENAME).writeFile(jsonStr);
    toast('✅ Custom snippets saved successfully.');
  } catch (err) {
    console.error('[SNIPPETS] Save error:', err);
    toast(`❌ Failed to save snippets: ${err.message}`);
  }
}