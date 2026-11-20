// Minimal unified-diff generator using an LCS of lines. Good enough for review UI.
function lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([' ', a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['-', a[i++]]); }
    else { out.push(['+', b[j++]]); }
  }
  while (i < n) out.push(['-', a[i++]]);
  while (j < m) out.push(['+', b[j++]]);
  return out;
}

export function unifiedDiff(files) {
  const parts = [];
  for (const f of files) {
    const before = String(f.before ?? '').split('\n');
    const after = String(f.after ?? '').split('\n');
    const ops = lcs(before, after);
    parts.push(`--- a/${f.path}\n+++ b/${f.path}`);
    let oldLine = 1, newLine = 1;
    const chunks = [];
    let cur = null;
    for (const [op, text] of ops) {
      if (op === ' ') {
        if (cur) { chunks.push(cur); cur = null; }
        oldLine++; newLine++;
      } else {
        if (!cur) cur = { oldStart: oldLine, newStart: newLine, lines: [] };
        cur.lines.push(`${op}${text}`);
        if (op === '-') oldLine++; else newLine++;
      }
    }
    if (cur) chunks.push(cur);
    for (const c of chunks.slice(0, 20)) {
      const oldCount = c.lines.filter((l) => !l.startsWith('+')).length;
      const newCount = c.lines.filter((l) => !l.startsWith('-')).length;
      parts.push(`@@ -${c.oldStart},${oldCount} +${c.newStart},${newCount} @@`);
      parts.push(c.lines.join('\n'));
    }
  }
  return parts.join('\n') + '\n';
}

export function changedLineCount(diff) {
  return String(diff).split('\n').filter((l) => (l.startsWith('+') && !l.startsWith('+++')) || (l.startsWith('-') && !l.startsWith('---'))).length;
}
