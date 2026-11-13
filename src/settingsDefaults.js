/**
 * settingsDefaults.js — single source of defaults for C/C++ plugin
 */
export const defaultSettings = {
  // Global
  pluginEnabled: true,

  // Runner
  runMode: 'ask', // ask | terminal | popup | inline
  runInClearScreen: true,
  /** Optional shell lines before compile (terminal mode) */
  terminalShellPrefix: '',
  /** Extra args after the program binary */
  runArgs: '',
  enableInlineRunLogs: true,
  feedChipsInTerminal: false,

  // Terminal extra banners (inline never shows these)
  termShowCompileInfo: true,
  termShowFilePath: true,
  termShowCommand: true,
  termShowRunBanner: true,
  termShowTiming: true,
  termShowExitCode: true,

  // Popup extra banners — off by default (clean program output only)
  popupShowCompileInfo: false,
  popupShowFilePath: false,
  popupShowCommand: false,
  popupShowRunBanner: false,
  popupShowTiming: false,
  popupShowExitCode: false,


  // Input chips & buffer
  enableInputChips: true,
  blockRunWithoutInputs: true,
  clearInputOnType: true, // clear chip values when user edits the file
  maxLoopInputs: 100, // max scanf/cin rounds collected when input is inside a loop
  chipPreviewValues: 5, // how many values to show on the chip label (1–10)
  autoBufferFix: true, // idea.md fflush fix — on by default, user can disable

  // Linter
  enableLinter: 'both',
  errorTrigger: 'onKeypress',
  showProblemsSideButton: true,

  // LSP
  clangdArgs: '--background-index --suggest-missing-includes',
  enableHover: true,
  enableGoToDefinition: true,
  enableFindReferences: true,
  enableRename: true,
  enableLspCompletion: true,
  enableInlayHints: false,

  // Fallback autocomplete
  enableSnippets: true,
  enableKeywords: true,
  enableIdentifiers: true,

  // Custom snippets
  enableCustomSnippets: false,
  customSnippetPath: '',

  // Tree-sitter & auto import
  enableTreeSitterAnalysis: false,
  autoImportTrigger: 'onSave',
  autoImportNewlineStyle: 'noSpace',
  removeUnusedHeaders: 'comment',

  // Compiler
  cStandard: 'gnu11',
  cppStandard: 'gnu++17',
  compilerFlags: '-Wall -Wextra -O2',

  // Formatter
  clangFormatStyle: 'Google',
  clangFormatCustom: '',
  formatOnSave: false,

  // Internal
  showToolsSideButton: true,
  dependenciesInstalled: false,
};

