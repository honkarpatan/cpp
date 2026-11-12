// src/main.js
import plugin from '../plugin.json';
import { initPlugin, destroyPlugin } from './initPlugin.js';
import './styles.css';
import './settings.css';
import { getSettings, settingsList, onSettingsChange } from './settings.js';

if (window.acode) {
  acode.setPluginInit(plugin.id, async (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    console.log('[DEBUG-MAIN] C/Cpp is starting from main.js...');
    try {
      await initPlugin(baseUrl, $page, { cacheFileUrl, cacheFile });
      console.log('[DEBUG-MAIN] ✅ Plugin initialized successfully.');
    } catch (error) {
      console.error('[DEBUG-MAIN] ❌ Error during initialization:', error);
    }
  }, {
    list: settingsList,
    cb: onSettingsChange,
  });

  acode.setPluginUnmount(plugin.id, () => {
    console.log('[DEBUG-MAIN] 🧹 Plugin is unmounting...');
    if (typeof destroyPlugin === 'function') {
      destroyPlugin();
    }
  });
}
