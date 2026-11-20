// src/runButtonManager.js

import { compileAndRun } from './runner.js';
import { ensureCDeps } from './dependencyChecker.js';
import { getSettings } from './settings.js';

const toast = acode.require('toast');

class RunButtonManager {
  constructor() {
    this.checkFile = this.checkFile.bind(this);
    this.handleIconClick = this.handleIconClick.bind(this);
    this.removeBtnTimeout = null;
    this.sourceFile = null;
  }

  init() {
    this.setupPlayButton();
    editorManager.on('switch-file', this.checkFile);
    editorManager.on('rename-file', this.checkFile);
  }

  setupPlayButton() {
    this.$runBtn = document.createElement('span');
    this.setButtonState('run');
    this.$runBtn.onclick = this.handleIconClick;
    this.checkFile();
  }

  setButtonState(mode) {
    if (mode === 'run') {
      this.$runBtn.className = 'icon play_arrow cpp-run-button';
      this.$runBtn.setAttribute('action', 'run-cpp');
      this.$runBtn.title = 'Compile & Run C/C++';
    } else if (mode === 'back') {
      this.$runBtn.className = 'icon arrow_back cpp-run-button';
      this.$runBtn.setAttribute('action', 'back-to-cpp');
      this.$runBtn.title = 'Back to Source Code';
    }
  }

  async handleIconClick() {
    const action = this.$runBtn.getAttribute('action');

    if (action === 'run-cpp') {
      const ok = await ensureCDeps({
        force: true,
        reason: 'Run needs gcc/g++. Install the C/C++ toolchain now?',
      });
      if (!ok) return;

      const fileToRun = editorManager.activeFile;
      if (fileToRun) {
        this.sourceFile = fileToRun;
        try {
          if (fileToRun.isUnsaved) {
            await fileToRun.save();
          }

          // runMode from settings (ask → picker inside compileAndRun)
          const settings = getSettings();
          await compileAndRun(fileToRun, { mode: settings.runMode || 'ask' });

          setTimeout(() => this.checkFile(), 500);
        } catch (err) {
          console.error('[Run Error]:', err);
          toast('Error executing code. Check console.');
        }
      }
    } else if (action === 'back-to-cpp') {
      if (this.sourceFile) {
        this.sourceFile.makeActive();
      }
    }
  }

  checkFile() {
    if (this.removeBtnTimeout) clearTimeout(this.removeBtnTimeout);

    const activeFile = editorManager.activeFile;
    const isCppFile =
      activeFile && /\.(c|cpp|cxx|cc|h|hpp)$/i.test(activeFile.filename);

    const isTerminalPage =
      activeFile &&
      (activeFile.filename.includes('Terminal') ||
        activeFile.uri?.includes('terminal'));

    if (isTerminalPage && this.sourceFile) {
      this.setButtonState('back');
    } else if (isCppFile) {
      this.setButtonState('run');
      this.sourceFile = activeFile;
    } else {
      this.removeBtnTimeout = setTimeout(() => {
        if (this.$runBtn.isConnected) this.$runBtn.remove();
      }, 200);
    }

    if (
      !this.$runBtn.isConnected &&
      (isCppFile || (isTerminalPage && this.sourceFile))
    ) {
      const header = document.querySelector('#root > header.tile');
      if (header) header.insertBefore(this.$runBtn, header.lastChild);
    }

    setTimeout(() => {
      const mainHeaderRunBtn = document.querySelector(
        '#root > header.tile > span.icon.play_arrow[action="run"]'
      );
      if (mainHeaderRunBtn) {
        mainHeaderRunBtn.style.display =
          isCppFile || (isTerminalPage && this.sourceFile) ? 'none' : '';
      }
    }, 100);
  }

  destroy() {
    if (this.removeBtnTimeout) clearTimeout(this.removeBtnTimeout);
    if (this.$runBtn) this.$runBtn.remove();

    editorManager.off('switch-file', this.checkFile);
    editorManager.off('rename-file', this.checkFile);

    this.sourceFile = null;
  }
}

export default new RunButtonManager();
