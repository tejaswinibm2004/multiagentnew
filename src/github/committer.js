import { ghFetch, configured } from './client.js';

// Atomic multi-file commit via Git Data API: ref -> commit -> blobs -> tree -> commit -> ref.
// Non-fast-forward is handled by rebuilding once on the freshly fetched ref.
export async function commitFiles({ repo, branch = 'main', files, message }) {
  if (!configured()) return { ok: false, reason: 'GITHUB_UNAVAILABLE', detail: 'GITHUB_TOKEN not configured' };
  if (!files?.length) return { ok: false, reason: 'EMPTY_COMMIT' };

  for (let attempt = 0; attempt < 2; attempt++) {
    const refRes = await ghFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    if (!refRes.ok) return { ok: false, reason: 'REF_FAILED', detail: `ref ${refRes.status}` };
    const parentSha = refRes.data.object.sha;

    const parentCommit = await ghFetch(`/repos/${repo}/git/commits/${parentSha}`);
    if (!parentCommit.ok) return { ok: false, reason: 'REF_FAILED', detail: `commit ${parentCommit.status}` };
    const baseTree = parentCommit.data.tree.sha;

    const blobs = [];
    for (const f of files) {
      const b = await ghFetch(`/repos/${repo}/git/blobs`, { method: 'POST', body: { content: f.content, encoding: 'utf-8' } });
      if (!b.ok) return { ok: false, reason: 'BLOB_FAILED', detail: `blob ${b.status}` };
      blobs.push({ path: f.path, mode: '100644', type: 'blob', sha: b.data.sha });
    }

    const treeRes = await ghFetch(`/repos/${repo}/git/trees`, { method: 'POST', body: { base_tree: baseTree, tree: blobs } });
    if (!treeRes.ok) return { ok: false, reason: 'TREE_FAILED', detail: `tree ${treeRes.status}` };

    const commitRes = await ghFetch(`/repos/${repo}/git/commits`, {
      method: 'POST',
      body: { message, tree: treeRes.data.sha, parents: [parentSha] },
    });
    if (!commitRes.ok) return { ok: false, reason: 'COMMIT_FAILED', detail: `commit ${commitRes.status}` };
    const sha = commitRes.data.sha;

    const patch = await ghFetch(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      body: { sha, force: false },
    });
    if (patch.ok) {
      return { ok: true, sha, html_url: `https://github.com/${repo}/commit/${sha}` };
    }
    if (attempt === 0 && [409, 422].includes(patch.status)) continue; // rebase once
    return { ok: false, reason: 'PUSH_FAILED', detail: `patch ${patch.status}` };
  }
  return { ok: false, reason: 'PUSH_FAILED' };
}

// A true revert commit: new commit whose tree equals the target's parent tree,
// with the target commit as its parent.
export async function revertCommit({ repo, branch = 'main', targetSha, message }) {
  if (!configured()) return { ok: false, reason: 'GITHUB_UNAVAILABLE' };
  const commit = await ghFetch(`/repos/${repo}/commits/${targetSha}`);
  if (!commit.ok) return { ok: false, reason: 'TARGET_NOT_FOUND' };
  const parents = commit.data.parents || [];
  if (!parents.length) return { ok: false, reason: 'NO_PARENT' };
  const parentSha = parents[0].sha;

  const ref = await ghFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!ref.ok) return { ok: false, reason: 'REF_FAILED' };
  const headSha = ref.data.object.sha;

  const parentCommit = await ghFetch(`/repos/${repo}/git/commits/${parentSha}`);
  if (!parentCommit.ok) return { ok: false, reason: 'PARENT_FAILED' };
  const tree = parentCommit.data.tree.sha;

  const created = await ghFetch(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: { message: `revert(bugshield): ${message}`, tree, parents: [headSha] },
  });
  if (!created.ok) return { ok: false, reason: 'COMMIT_FAILED', detail: `commit ${created.status}` };
  const sha = created.data.sha;
  const patch = await ghFetch(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH', body: { sha, force: false },
  });
  if (!patch.ok) return { ok: false, reason: 'PUSH_FAILED', detail: `patch ${patch.status}` };
  return { ok: true, sha, html_url: `https://github.com/${repo}/commit/${sha}` };
}
