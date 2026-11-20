// src/settings.js — Hub + category settings (Python-tools style)
import plugin from '../plugin.json';
import { defaultSettings } from './settingsDefaults.js';
import { hubList, openCategory, setPluginId } from './settingsPages.js';
import { selectCustomSnippetPath } from './customSnippets.js';
import { clearSnippetCache } from './completer.js';
import { clearAllLogs, handleEditorUpdate } from './inlineDisplay.js';
import { clearLinterState } from './linter.js';
import { hideContextMenu } from './customContextMenu.js';
import { setProblemsSideButtonVisible } from './problemsPage.js';
import {
  checkDependenciesAction,
  reinstallDependenciesAction,
  uninstallDependenciesAction,
} from './dependencyChecker.js';
import { scheduleRefresh as refreshInputChips } from './inputChips.js';

const appSettings = acode.require('settings');

try {
  setPluginId(plugin.id);
} catch (_) {}

function ensureSettings() {
  let pluginSettings = appSettings.value[plugin.id];
  if (!pluginSettings) {
    pluginSettings = { ...defaultSettings };
    appSettings.value[plugin.id] = pluginSettings;
    appSettings.update(false);
    return pluginSettings;
  }
  let changed = false;
  for (const key in defaultSettings) {
    if (!(key in pluginSettings)) {
      pluginSettings[key] = defaultSettings[key];
      changed = true;
    }
  }
  // keep unknown keys for backward compat but prefer defaults for new keys
  if (changed) appSettings.update(false);
  return pluginSettings;
}

function getSettings() {
  return ensureSettings();
}

/** Top-level Acode settings: category hub only */
const settingsList = hubList();

function onSettingsChange(key, value) {
  // Category rows → open sub-page
  if (typeof key === 'string' && key.startsWith('__cat_')) {
    openCategory(key);
    return;
  }

  const settings = getSettings();

  if (key === 'runSnippetPathSelector') {
    selectCustomSnippetPath();
    return;
  }
  if (key === 'checkDependencies' || key === '__deps_check') {
    checkDependenciesAction().catch((e) => console.error('[Deps] check', e));
    return;
  }
  if (key === 'reinstallDependencies' || key === '__deps_reinstall') {
    reinstallDependenciesAction().catch((e) => console.error('[Deps] reinstall', e));
    return;
  }
  if (key === 'uninstallDependencies' || key === '__deps_uninstall') {
    uninstallDependenciesAction().catch((e) => console.error('[Deps] uninstall', e));
    return;
  }

  settings[key] = value;
  appSettings.update();

  if (key === 'customSnippetPath' || key === 'enableCustomSnippets') {
    clearSnippetCache();
  }

  if (key === 'enableGoToDefinition' && !value) {
    hideContextMenu();
  }

  if (key === 'enableLinter') {
    const session = editorManager.activeFile?.session;
    clearAllLogs();
    if (session) clearLinterState(session);
    if (value !== 'disable') {
      handleEditorUpdate();
    }
  }

  if (key === 'showProblemsSideButton') {
    setProblemsSideButtonVisible(!!value);
  }

  if (
    key === 'enableInputChips' ||
    key === 'pluginEnabled'
  ) {
    try {
      refreshInputChips();
    } catch (_) {}
  }
}

export { getSettings, settingsList, onSettingsChange, defaultSettings };
