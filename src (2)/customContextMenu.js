// src/customContextMenu.js
// Go to Definition via Acode built-in Selection Menu + acode.addIcon
import { executeGoToDefinition } from './goToDefinition.js';
import { getSettings } from './settings.js';

const ICON_NAME = 'cpp-goto-def';

let registered = false;
let iconReady = false;

/** No-op — custom floating popup removed */
export function hideContextMenu() {}
export function showContextMenu() {}

/**
 * SVG for Go to Definition (fill=currentColor for monochrome theme tint).
 */
function getGotoDefSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 76" width="20" height="20">
  <path fill="currentColor" d="M 54.625,36.4167C 59.4345,36.4167 63.3333,40.3155 63.3333,45.125C 63.3333,49.9345 59.4345,53.8333 54.625,53.8333C 49.8155,53.8333 45.9167,49.9345 45.9167,45.125C 45.9167,40.3155 49.8155,36.4167 54.625,36.4167 Z M 21.375,34.8333C 26.1845,34.8333 30.0833,38.7322 30.0833,43.5417C 30.0833,48.3512 26.1845,52.25 21.375,52.25C 16.5655,52.25 12.6667,48.3512 12.6667,43.5417C 12.6667,38.7322 16.5655,34.8333 21.375,34.8333 Z M 21.375,38.7917C 18.7516,38.7917 16.625,40.9183 16.625,43.5417C 16.625,46.165 18.7516,48.2917 21.375,48.2917C 23.9983,48.2917 26.125,46.165 26.125,43.5417C 26.125,40.9183 23.9983,38.7917 21.375,38.7917 Z M 31.6667,22.1667L 31.6667,28.5C 33.9762,26.0538 37.536,24.2918 41.1658,24.2918C 46.9073,24.2918 51.7566,28.1124 53.3112,33.3484C 51.9232,33.5585 50.6426,34.0962 49.5509,34.8802C 48.6202,31.1145 45.2191,28.3225 41.1659,28.3225C 38.6078,28.3225 36.4148,29.8997 34.8333,31.6667L 41.1667,31.6667L 38,34.8333L 28.5,34.8333L 28.5,25.3333L 31.6667,22.1667 Z"/>
</svg>`;
}

/**
 * Register icon with Acode:
 *   acode.addIcon(iconName, iconSrc, { monochrome?: boolean })
 * Later: <span class="icon cpp-goto-def"></span>
 */
export function registerGotoDefIcon() {
  if (iconReady) return true;
  try {
    if (typeof acode.addIcon !== 'function') {
      console.warn('[GoToDef] acode.addIcon not available');
      return false;
    }
    const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(getGotoDefSvg());
    acode.addIcon(ICON_NAME, dataUrl, { monochrome: true });
    iconReady = true;
    console.log(`[GoToDef] ✅ acode.addIcon("${ICON_NAME}", dataUrl, { monochrome: true })`);
    return true;
  } catch (e) {
    console.error('[GoToDef] addIcon failed:', e);
    return false;
  }
}

function createGoToDefIconEl() {
  registerGotoDefIcon();
  const el = document.createElement('span');
  // Same pattern as Acode built-ins: <span class="icon copy"></span>
  el.className = `icon ${ICON_NAME}`;
  el.title = 'Go to Definition';
  el.setAttribute('aria-label', 'Go to Definition');
  return el;
}

/**
 * Register on Acode selection menu.
 * selectionMenu.add(onclick, text|HTMLElement, mode, readOnly)
 */
export function registerGoToDefSelectionMenu() {
  if (registered) return;

  try {
    registerGotoDefIcon();

    const selectionMenu = acode.require('selectionMenu');
    if (!selectionMenu || typeof selectionMenu.add !== 'function') {
      console.warn('[GoToDef] selectionMenu API missing');
      return;
    }

    selectionMenu.add(
      () => {
        try {
          const settings = getSettings();
          if (!settings.enableGoToDefinition) return;

          const file = editorManager.activeFile;
          if (!file || !/\.(c|cpp|cxx|cc|h|hpp|hh|hxx)$/i.test(file.filename || '')) {
            return;
          }
          executeGoToDefinition();
        } catch (err) {
          console.error('[GoToDef] click error:', err);
        }
      },
      createGoToDefIconEl(),
      'selected',
      true
    );

    registered = true;
    console.log(`[GoToDef] ✅ selectionMenu item registered (.icon.${ICON_NAME})`);
  } catch (e) {
    console.error('[GoToDef] selectionMenu registration failed:', e);
  }
}
