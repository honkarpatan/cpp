/**
 * C/C++ Go to References — VS Code style peek (modules/peekReferences)
 */
import { createPeekReferences, CPP_PROFILE } from './modules/peekReferences/index.js';

let peek = null;

function getPeek() {
  if (!peek) {
    peek = createPeekReferences({
      profile: CPP_PROFILE,
      getDirLabel: (file) => {
        try {
          const uri = file?.uri || file?.url || '';
          if (!uri) return '';
          const parts = String(uri).split('/');
          parts.pop();
          const tail = parts.slice(-2).join('/');
          return tail ? tail + '/' : '';
        } catch (_) {
          return '';
        }
      },
    });
  }
  return peek;
}

export function executeFindReferences() {
  return getPeek().show();
}

export function disposeFindReferences() {
  try {
    peek?.dispose?.();
  } catch (_) {}
  peek = null;
}
