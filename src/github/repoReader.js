import { ghFetch, configured } from './client.js';

const IGNORE = /(^|\/)(node_modules|dist|build|vendor|\.git|coverage)(\/|$)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)$/i;
const MAX_BYTES = 200 * 1024;

export async function getRepoMap(repo, branch = 'main') {
  if (!configured()) return { ok: false, reason: 'GITHUB_UNAVAILABLE', files: [] };
  const r = await ghFetch(`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (!r.ok) return { ok: false, reason: 'GITHUB_UNAVAILABLE', detail: `tree ${r.status}`, files: [] };
  const files = (r.data?.tree || [])
    .filter((e) => e.type === 'blob' && !IGNORE.test(e.path) && (e.size || 0) <= MAX_BYTES)
    .map((e) => e.path)
    .slice(0, 400);
  return { ok: true, files };
}

export async function getFile(repo, path, ref = 'main') {
  if (!configured()) return { ok: false, reason: 'GITHUB_UNAVAILABLE' };
  const r = await ghFetch(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  if (!r.ok) return { ok: false, reason: 'GITHUB_UNAVAILABLE', detail: `contents ${r.status}` };
  const content = Buffer.from(String(r.data.content || '').replace(/\s/g, ''), 'base64').toString('utf8');
  return { ok: true, content, sha: r.data.sha };
}

export function windows(content, centerLine, radius = 80) {
  const lines = String(content).split('\n');
  const n = centerLine > 0 ? centerLine - 1 : 0;
  const from = Math.max(0, n - radius);
  const to = Math.min(lines.length, n + radius + 1);
  return lines.slice(from, to).map((text, i) => `${from + i + 1}\t${text}`).join('\n');
}
