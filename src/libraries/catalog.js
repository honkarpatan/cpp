// src/libraries/catalog.js
// Curated C/C++ library catalog for the Alpine (apk) environment the plugin runs in.
// Pure data + pure helpers (no `acode`, no DOM) so it can be unit-tested and reused.
//
// Entry fields
//   id        stable key
//   name      display name
//   desc      one line
//   cat       category id (see CATEGORIES)
//   apk       apk packages to install (first is the -dev package users care about)
//   pc        pkg-config module(s) used for auto-link; null = no .pc file
//   cflags    fallback compile flags when pkg-config is unavailable / has no module
//   ldflags   fallback link flags (same)
//   headers   include paths that identify this library: strings are prefix matches
//             ("curl/" matches "curl/curl.h"), RegExp is tested on the include path
//   include   line inserted by "Insert #include"
//   headerOnly true for header-only libraries (nothing to link)
//   display   true when the library needs a screen (compiles, but windows cannot open
//             inside the Acode terminal) — shown as a badge
//   note      optional extra hint

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Installed' },
  { id: 'data', label: 'Database' },
  { id: 'net', label: 'Network' },
  { id: 'json', label: 'JSON & XML' },
  { id: 'text', label: 'Text & Logging' },
  { id: 'math', label: 'Math' },
  { id: 'zip', label: 'Compression' },
  { id: 'test', label: 'Testing' },
  { id: 'term', label: 'Terminal' },
  { id: 'gfx', label: 'Graphics' },
  { id: 'misc', label: 'More' },
];

export const LIBRARIES = [
  // ── Database ─────────────────────────────────────────────
  {
    id: 'sqlite', name: 'SQLite', cat: 'data',
    desc: 'Embedded SQL database in a single file',
    apk: ['sqlite-dev'], pc: ['sqlite3'], ldflags: '-lsqlite3',
    headers: ['sqlite3.h'], include: '#include <sqlite3.h>',
  },
  {
    id: 'libpq', name: 'PostgreSQL client (libpq)', cat: 'data',
    desc: 'Connect to PostgreSQL servers',
    apk: ['libpq-dev'], pc: ['libpq'], ldflags: '-lpq',
    headers: ['libpq-fe.h', 'postgres_ext.h'], include: '#include <libpq-fe.h>',
  },
  {
    id: 'mariadb', name: 'MariaDB / MySQL client', cat: 'data',
    desc: 'Connect to MariaDB and MySQL servers',
    apk: ['mariadb-connector-c-dev'], pc: ['libmariadb'], ldflags: '-lmariadb',
    headers: ['mariadb/', 'mysql/', 'mysql.h'], include: '#include <mariadb/mysql.h>',
  },

  // ── Network ──────────────────────────────────────────────
  {
    id: 'curl', name: 'libcurl', cat: 'net',
    desc: 'HTTP, HTTPS, FTP requests and downloads',
    apk: ['curl-dev'], pc: ['libcurl'], ldflags: '-lcurl',
    headers: ['curl/'], include: '#include <curl/curl.h>',
  },
  {
    id: 'openssl', name: 'OpenSSL', cat: 'net',
    desc: 'TLS, hashing, encryption',
    apk: ['openssl-dev'], pc: ['openssl'], ldflags: '-lssl -lcrypto',
    headers: ['openssl/'], include: '#include <openssl/ssl.h>',
  },
  {
    id: 'libuv', name: 'libuv', cat: 'net',
    desc: 'Async I/O and event loop (the core of Node.js)',
    apk: ['libuv-dev'], pc: ['libuv'], ldflags: '-luv',
    headers: ['uv.h', 'uv/'], include: '#include <uv.h>',
  },
  {
    id: 'libevent', name: 'libevent', cat: 'net',
    desc: 'Event-driven networking',
    apk: ['libevent-dev'], pc: ['libevent'], ldflags: '-levent',
    headers: ['event2/', 'event.h'], include: '#include <event2/event.h>',
  },
  {
    id: 'boost', name: 'Boost', cat: 'misc',
    desc: 'Huge collection of portable C++ libraries',
    apk: ['boost-dev'], pc: null, headerOnly: true,
    headers: ['boost/'], include: '#include <boost/algorithm/string.hpp>',
    note: 'Most of Boost is header-only. Compiled parts (filesystem, regex, thread…) are linked automatically.',
  },

  // ── JSON & XML ───────────────────────────────────────────
  {
    id: 'nlohmann', name: 'nlohmann/json', cat: 'json',
    desc: 'Modern JSON for C++ — feels like Python dicts',
    apk: ['nlohmann-json'], pc: ['nlohmann_json'], headerOnly: true,
    headers: ['nlohmann/'], include: '#include <nlohmann/json.hpp>',
  },
  {
    id: 'jsoncpp', name: 'JsonCpp', cat: 'json',
    desc: 'JSON reader and writer for C++',
    apk: ['jsoncpp-dev'], pc: ['jsoncpp'], ldflags: '-ljsoncpp',
    headers: ['json/'], include: '#include <json/json.h>',
  },
  {
    id: 'cjson', name: 'cJSON', cat: 'json',
    desc: 'Tiny JSON parser for plain C',
    apk: ['cjson-dev'], pc: ['libcjson'], ldflags: '-lcjson',
    headers: ['cjson/', 'cJSON.h'], include: '#include <cjson/cJSON.h>',
  },
  {
    id: 'yaml-cpp', name: 'yaml-cpp', cat: 'json',
    desc: 'YAML parser and emitter',
    apk: ['yaml-cpp-dev'], pc: ['yaml-cpp'], ldflags: '-lyaml-cpp',
    headers: ['yaml-cpp/'], include: '#include <yaml-cpp/yaml.h>',
  },
  {
    id: 'tinyxml2', name: 'TinyXML-2', cat: 'json',
    desc: 'Small, simple XML parser',
    apk: ['tinyxml2-dev'], pc: ['tinyxml2'], ldflags: '-ltinyxml2',
    headers: ['tinyxml2.h'], include: '#include <tinyxml2.h>',
  },
  {
    id: 'pugixml', name: 'pugixml', cat: 'json',
    desc: 'Fast XML parser with XPath',
    apk: ['pugixml-dev'], pc: ['pugixml'], ldflags: '-lpugixml',
    headers: ['pugixml.hpp'], include: '#include <pugixml.hpp>',
  },
  {
    id: 'libxml2', name: 'libxml2', cat: 'json',
    desc: 'Full XML / HTML parser',
    apk: ['libxml2-dev'], pc: ['libxml-2.0'], cflags: '-I/usr/include/libxml2', ldflags: '-lxml2',
    headers: ['libxml/'], include: '#include <libxml/parser.h>',
  },

  // ── Text & logging ───────────────────────────────────────
  {
    id: 'fmt', name: '{fmt}', cat: 'text',
    desc: 'Fast, safe string formatting (std::format before C++20)',
    apk: ['fmt-dev'], pc: ['fmt'], ldflags: '-lfmt',
    headers: ['fmt/'], include: '#include <fmt/core.h>',
  },
  {
    id: 'spdlog', name: 'spdlog', cat: 'text',
    desc: 'Fast logging with levels and sinks',
    apk: ['spdlog-dev'], pc: ['spdlog'], ldflags: '-lspdlog -lfmt',
    headers: ['spdlog/'], include: '#include <spdlog/spdlog.h>',
  },

  // ── Math ─────────────────────────────────────────────────
  {
    id: 'eigen', name: 'Eigen', cat: 'math',
    desc: 'Matrices, vectors and linear algebra',
    apk: ['eigen-dev'], pc: ['eigen3'], cflags: '-I/usr/include/eigen3', headerOnly: true,
    headers: ['Eigen/', 'unsupported/Eigen/'], include: '#include <Eigen/Dense>',
  },
  {
    id: 'glm', name: 'GLM', cat: 'math',
    desc: 'Vector and matrix math for graphics',
    apk: ['glm-dev'], pc: ['glm'], headerOnly: true,
    headers: ['glm/'], include: '#include <glm/glm.hpp>',
  },
  {
    id: 'gmp', name: 'GMP', cat: 'math',
    desc: 'Arbitrary-precision integers and rationals',
    apk: ['gmp-dev'], pc: ['gmp'], ldflags: '-lgmpxx -lgmp',
    headers: ['gmp.h', 'gmpxx.h'], include: '#include <gmpxx.h>',
  },

  // ── Compression ──────────────────────────────────────────
  {
    id: 'zlib', name: 'zlib', cat: 'zip',
    desc: 'Deflate / gzip compression',
    apk: ['zlib-dev'], pc: ['zlib'], ldflags: '-lz',
    headers: ['zlib.h'], include: '#include <zlib.h>',
  },
  {
    id: 'bzip2', name: 'bzip2', cat: 'zip',
    desc: 'High-ratio block compression',
    apk: ['bzip2-dev'], pc: ['bzip2'], ldflags: '-lbz2',
    headers: ['bzlib.h'], include: '#include <bzlib.h>',
  },
  {
    id: 'zstd', name: 'Zstandard', cat: 'zip',
    desc: 'Fast modern compression from Facebook',
    apk: ['zstd-dev'], pc: ['libzstd'], ldflags: '-lzstd',
    headers: ['zstd.h'], include: '#include <zstd.h>',
  },
  {
    id: 'lz4', name: 'LZ4', cat: 'zip',
    desc: 'Extremely fast compression',
    apk: ['lz4-dev'], pc: ['liblz4'], ldflags: '-llz4',
    headers: ['lz4.h', 'lz4frame.h'], include: '#include <lz4.h>',
  },

  // ── Testing ──────────────────────────────────────────────
  {
    id: 'gtest', name: 'GoogleTest', cat: 'test',
    desc: 'Unit testing and mocking framework',
    apk: ['gtest-dev'], pc: ['gtest_main'], ldflags: '-lgtest_main -lgtest -pthread',
    headers: ['gtest/', 'gmock/'], include: '#include <gtest/gtest.h>',
  },
  {
    id: 'catch2', name: 'Catch2', cat: 'test',
    desc: 'Friendly unit test framework',
    apk: ['catch2-3'], pc: ['catch2-with-main'], ldflags: '-lCatch2Main -lCatch2',
    headers: ['catch2/'], include: '#include <catch2/catch_all.hpp>',
  },

  // ── Terminal ─────────────────────────────────────────────
  {
    id: 'ncurses', name: 'ncurses', cat: 'term',
    desc: 'Text-mode UIs in the terminal',
    apk: ['ncurses-dev'], pc: ['ncurses'], ldflags: '-lncurses',
    headers: ['ncurses.h', 'curses.h'], include: '#include <ncurses.h>',
  },
  {
    id: 'readline', name: 'GNU Readline', cat: 'term',
    desc: 'Line editing and history for input',
    apk: ['readline-dev'], pc: ['readline'], ldflags: '-lreadline -lncurses',
    headers: ['readline/'], include: '#include <readline/readline.h>',
  },

  // ── Graphics ─────────────────────────────────────────────
  {
    id: 'sdl2', name: 'SDL2', cat: 'gfx', display: true,
    desc: 'Windows, input, audio and 2D rendering',
    apk: ['sdl2-dev'], pc: ['sdl2'], cflags: '-I/usr/include/SDL2', ldflags: '-lSDL2',
    headers: ['SDL2/', 'SDL.h'], include: '#include <SDL2/SDL.h>',
  },
  {
    id: 'raylib', name: 'raylib', cat: 'gfx', display: true,
    desc: 'Simple library for games and graphics',
    apk: ['raylib-dev'], pc: ['raylib'], ldflags: '-lraylib',
    headers: ['raylib.h', 'raymath.h'], include: '#include <raylib.h>',
  },
  {
    id: 'glfw', name: 'GLFW', cat: 'gfx', display: true,
    desc: 'OpenGL windows and input',
    apk: ['glfw-dev'], pc: ['glfw3'], ldflags: '-lglfw',
    headers: ['GLFW/'], include: '#include <GLFW/glfw3.h>',
  },
  {
    id: 'libpng', name: 'libpng', cat: 'gfx',
    desc: 'Read and write PNG images',
    apk: ['libpng-dev'], pc: ['libpng'], ldflags: '-lpng',
    headers: ['png.h'], include: '#include <png.h>',
  },
  {
    id: 'freetype', name: 'FreeType', cat: 'gfx',
    desc: 'Font rendering',
    apk: ['freetype-dev'], pc: ['freetype2'], cflags: '-I/usr/include/freetype2', ldflags: '-lfreetype',
    headers: ['ft2build.h', 'freetype/'], include: '#include <ft2build.h>',
  },

  // ── More ─────────────────────────────────────────────────
  {
    id: 'lua', name: 'Lua 5.4', cat: 'misc',
    desc: 'Embed a small scripting language',
    apk: ['lua5.4-dev'], pc: ['lua5.4'], cflags: '-I/usr/include/lua5.4', ldflags: '-llua5.4',
    headers: ['lua.h', 'lualib.h', 'lauxlib.h', 'lua.hpp'], include: '#include <lua.hpp>',
  },
  {
    id: 'pcre2', name: 'PCRE2', cat: 'misc',
    desc: 'Perl-compatible regular expressions',
    apk: ['pcre2-dev'], pc: ['libpcre2-8'], ldflags: '-lpcre2-8',
    headers: ['pcre2.h'], include: '#define PCRE2_CODE_UNIT_WIDTH 8\n#include <pcre2.h>',
  },
];

/** Extra link flags for the compiled parts of Boost, chosen by header. */
export const BOOST_LINK_RULES = [
  [/^boost\/filesystem/, '-lboost_filesystem -lboost_system'],
  [/^boost\/system|^boost\/asio/, '-lboost_system -pthread'],
  [/^boost\/thread/, '-lboost_thread -lboost_system -pthread'],
  [/^boost\/regex/, '-lboost_regex'],
  [/^boost\/program_options/, '-lboost_program_options'],
  [/^boost\/iostreams/, '-lboost_iostreams'],
  [/^boost\/chrono/, '-lboost_chrono -lboost_system'],
];

export function getLibrary(id) {
  return LIBRARIES.find((l) => l.id === id) || null;
}

function headerMatches(entry, path) {
  return entry.headers.some((h) => (h instanceof RegExp ? h.test(path) : path === h || path.startsWith(h)));
}

/** All `#include` paths of a source text (both <> and ""). */
export function extractIncludes(source) {
  const out = [];
  const re = /^[ \t]*#[ \t]*include[ \t]*[<"]([^>"\n]+)[>"]/gm;
  let m;
  const text = String(source || '');
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

/** The catalog entry that provides `includePath`, or null. */
export function libraryForHeader(includePath) {
  return LIBRARIES.find((l) => headerMatches(l, includePath)) || null;
}

/**
 * Libraries used by a set of sources (project files).
 * @param {string[]} sources
 * @param {{ localFiles?: string[] }} [opts]
 * @returns {{ lib: object, headers: string[] }[]}  in catalog order
 */
export function detectLibraries(sources, opts = {}) {
  const found = new Map();
  // headers that are the project's own files (e.g. "uv.h" next to main.c) are not libraries
  const local = new Set((opts.localFiles || []).map((f) => String(f).split('/').pop()));
  for (const src of sources || []) {
    for (const inc of extractIncludes(src)) {
      if (local.has(inc.split('/').pop()) && !inc.includes('/')) continue;
      const lib = libraryForHeader(inc);
      if (!lib) continue;
      if (!found.has(lib.id)) found.set(lib.id, { lib, headers: [] });
      const rec = found.get(lib.id);
      if (!rec.headers.includes(inc)) rec.headers.push(inc);
    }
  }
  return LIBRARIES.filter((l) => found.has(l.id)).map((l) => found.get(l.id));
}

/** Extra Boost link flags (deduplicated) for detected Boost headers. */
function boostFlags(headers) {
  const flags = [];
  for (const h of headers) {
    for (const [re, f] of BOOST_LINK_RULES) {
      if (re.test(h)) for (const x of f.split(' ')) if (!flags.includes(x)) flags.push(x);
    }
  }
  return flags.join(' ');
}

/**
 * Shell snippet that defines $LIB_CFLAGS and $LIB_LDFLAGS for the detected libraries.
 * Uses pkg-config when present and falls back to the catalog flags otherwise, so it is
 * harmless when the library or pkg-config is missing (the compiler then reports it).
 * Contains no single quotes (it is embedded inside `sh -c '…'` after escaping anyway).
 */
export function buildFlagsShell(detected) {
  const lines = ['LIB_CFLAGS=""', 'LIB_LDFLAGS=""'];
  for (const { lib, headers } of detected || []) {
    const cf = lib.cflags || '';
    const ld = [lib.ldflags || '', lib.id === 'boost' ? boostFlags(headers) : ''].filter(Boolean).join(' ');
    if (lib.pc && lib.pc.length) {
      const mods = lib.pc.join(' ');
      lines.push(
        `if command -v pkg-config >/dev/null 2>&1 && pkg-config --exists ${mods} 2>/dev/null; then` +
          ` LIB_CFLAGS="$LIB_CFLAGS $(pkg-config --cflags ${mods})";` +
          ` LIB_LDFLAGS="$LIB_LDFLAGS $(pkg-config --libs ${mods})";` +
          ` else LIB_CFLAGS="$LIB_CFLAGS ${cf}"; LIB_LDFLAGS="$LIB_LDFLAGS ${ld}"; fi`,
      );
    } else {
      if (cf) lines.push(`LIB_CFLAGS="$LIB_CFLAGS ${cf}"`);
      if (ld) lines.push(`LIB_LDFLAGS="$LIB_LDFLAGS ${ld}"`);
    }
  }
  return lines.join('\n');
}

/** Library to suggest for a gcc "fatal error: X: No such file or directory" line. */
export function parseMissingHeader(compilerOutput) {
  const out = [];
  const re = /fatal error:\s*([^\s:]+):\s*No such file or directory/g;
  let m;
  const text = String(compilerOutput || '');
  while ((m = re.exec(text)) !== null) {
    const lib = libraryForHeader(m[1]);
    if (lib && !out.some((o) => o.lib.id === lib.id)) out.push({ header: m[1], lib });
  }
  return out;
}

/** Search the catalog by name, description, apk package or include path. */
export function searchLibraries(query, list = LIBRARIES) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice();
  const words = q.split(/\s+/);
  return list.filter((l) => {
    const hay = [l.name, l.desc, l.id, ...l.apk, ...l.headers.filter((h) => typeof h === 'string')]
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Same as buildFlagsShell but as one `{ …; }` group so it can sit inside an `&&` chain. */
export function buildFlagsGroup(detected) {
  return '{ ' + buildFlagsShell(detected).split('\n').join('; ') + '; }';
}

/** Hint appended to a gcc "X.h: No such file or directory" message, or ''. */
export function missingHeaderHint(message) {
  const m = /^\s*([^\s:]+):\s*No such file or directory/.exec(String(message || ''));
  const lib = m && libraryForHeader(m[1]);
  return lib ? ` — install "${lib.name}" from Tools → Libraries` : '';
}

/**
 * Where to put `line` (an #include) in `text`.
 * @returns {{ status: 'exists' } | { status: 'insert', offset: number, insert: string }}
 */
export function planIncludeInsert(text, line) {
  const src = String(text || '');
  const wanted = String(line).split('\n').map((l) => l.trim()).filter(Boolean);
  const have = new Set(src.split(/\r?\n/).map((l) => l.trim().replace(/\s+/g, ' ')));
  const norm = (l) => l.replace(/\s+/g, ' ');
  if (wanted.every((l) => have.has(norm(l)))) return { status: 'exists' };

  // after the last #include of the first 150 lines, else at the very top
  const lines = src.split('\n');
  let last = -1;
  for (let i = 0; i < Math.min(lines.length, 150); i++) {
    if (/^\s*#\s*include\b/.test(lines[i])) last = i;
  }
  let offset = 0;
  if (last >= 0) {
    for (let i = 0; i <= last; i++) offset += lines[i].length + 1;
    offset = Math.min(offset, src.length);
    const needsNl = offset > 0 && src[offset - 1] !== '\n';
    return { status: 'insert', offset, insert: (needsNl ? '\n' : '') + line + '\n' };
  }
  return { status: 'insert', offset: 0, insert: line + '\n' };
}
