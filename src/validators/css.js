export default function validate(content) {
  const s = String(content);
  let depth = 0;
  for (const c of s) { if (c === '{') depth++; else if (c === '}') depth--; if (depth < 0) return { status: 'failed', detail: 'unbalanced braces' }; }
  if (depth !== 0) return { status: 'failed', detail: `unbalanced braces (${depth})` };
  return { status: 'ok', detail: 'balanced CSS braces (full parse not run)' };
}
