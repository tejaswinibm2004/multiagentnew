const PATTERNS = [
  { name: 'script tag', re: /<script\b/i },
  { name: 'remote URL', re: /https?:\/\//i },
  { name: 'eval', re: /\beval\s*\(/i },
  { name: 'innerHTML', re: /\.innerHTML\s*=/i },
  { name: 'network call', re: /\b(fetch|XMLHttpRequest|axios|WebSocket)\s*\(/i },
  { name: 'base64', re: /\b(atob|btoa|Buffer\.from\([^)]*['"]base64)/i },
  { name: 'credential', re: /\b(password|api[_-]?key|secret|token)\s*[:=]/i },
  { name: 'obfuscation', re: /\\x[0-9a-f]{2}|String\.fromCharCode/i },
  { name: 'instruction echo', re: /ignore (previous|all) instructions|you are now|system prompt/i },
];

export function scanDiff(diff) {
  const added = String(diff || '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  const findings = [];
  for (const p of PATTERNS) {
    const match = added.find((l) => p.re.test(l));
    if (match) findings.push({ name: p.name, line: match.slice(0, 200) });
  }
  return { hit: findings.length > 0, findings, addedLines: added.length };
}
