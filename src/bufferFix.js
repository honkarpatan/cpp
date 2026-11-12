/**
 * bufferFix.js — Auto-inject fflush(stdout) after prompt-style printf
 * before scanf/cin, fixing the classic C stdout buffering problem.
 * See idea.md.
 */

/**
 * Heuristic rewrite:
 * - After printf/puts/cout that look like prompts (no trailing \n before input),
 *   insert fflush(stdout); on the next line if missing.
 * - Does not touch user source on disk; only the copy sent to the compiler.
 *
 * @param {string} code
 * @param {boolean} isCpp
 * @returns {string}
 */
export function applyBufferFix(code, isCpp = false) {
  if (!code || typeof code !== 'string') return code;

  const lines = code.split('\n');
  const out = [];
  let needsStdio = false;

  const inputRe =
    /\b(scanf|fscanf|gets|fgets|getchar|cin\s*>>|std\s*::\s*cin\s*>>|getline\s*\()/;
  const printfRe = /\b(printf|puts|putchar)\s*\(/;
  const coutRe = /\b(cout|std\s*::\s*cout)\s*<</;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);

    // Look ahead: if this line is a print prompt and next meaningful line is input
    const isPrint = printfRe.test(line) || coutRe.test(line);
    if (!isPrint) continue;

    // Already has fflush on same or next line?
    if (/fflush\s*\(\s*stdout\s*\)/.test(line)) continue;
    if (i + 1 < lines.length && /fflush\s*\(\s*stdout\s*\)/.test(lines[i + 1])) continue;

    // Prompt-like: string literal without \n at end of format, or cout without endl/\n
    const hasNewlineInFmt = /\\n/.test(line) || /\bendl\b/.test(line) || /['"][^'"]*\\n[^'"]*['"]/.test(line);
    // Still flush if next line is input — classic case is printf("Enter: "); scanf
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j >= lines.length) continue;
    if (!inputRe.test(lines[j])) continue;

    // If printf already ends with \n, fflush is less critical but still ok for partial lines
    // User wants fix for missing flush before input — always inject when input follows.
    const indent = (line.match(/^(\s*)/) || ['', ''])[1];
    out.push(`${indent}fflush(stdout); /* acode-buffer-fix */`);
    needsStdio = true;
  }

  let result = out.join('\n');

  // Ensure stdio.h / cstdio for fflush if we injected and not already included
  if (needsStdio) {
    const hasStdio =
      /#\s*include\s*<stdio\.h>/.test(result) ||
      /#\s*include\s*<cstdio>/.test(result);
    if (!hasStdio) {
      const inc = isCpp ? '#include <cstdio>\n' : '#include <stdio.h>\n';
      // after last existing #include or at top
      const incMatch = result.match(/^(?:[ \t]*#[^\n]*\n)*/);
      if (incMatch) {
        const head = incMatch[0];
        result = head + inc + result.slice(head.length);
      } else {
        result = inc + result;
      }
    }
  }

  return result;
}
