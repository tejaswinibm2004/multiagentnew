import { api } from '../core/api.js';
import { icon, esc, timeAgo, short } from '../core/util.js';
import { empty } from '../components/ui.js';
import { state } from '../core/store.js';

export async function deploymentsView() {
  let rows = [];
  try { rows = (await api('/api/issues?status=all&limit=100')).issues; } catch {}
  const deps = rows.filter((i) => i.deploy_sha);
  const html = `<div class="page">
    <div class="page-head"><div><div class="eyebrow">Shipping ledger</div><h1>Deployments</h1>
      <div class="sub">Every bot commit, its verification state, and the live marker that proves it shipped.</div></div>
      <span class="chip">${icon('git-commit-horizontal','sm')} ${deps.length} commits</span></div>
    <div class="table-wrap">${deps.length ? `<table class="tbl"><thead><tr><th>Issue</th><th>Site</th><th>Commit SHA</th><th>State</th><th>Opened</th></tr></thead><tbody>
      ${deps.map((i) => `<tr data-issue="${i.id}"><td class="key">${esc(i.issue_key)}</td><td>${esc(i.website_name || '—')}</td>
        <td class="mono">${short(i.deploy_sha, 12)}</td><td>${`<span class="badge ${i.status === 'RESOLVED_AND_DEPLOYED' ? 'green' : i.status === 'ROLLED_BACK' ? 'red' : 'amber'}">${esc(i.status.replace(/_/g, ' '))}</span>`}</td>
        <td class="dim small">${timeAgo(i.created_at)}</td></tr>`).join('')}
    </tbody></table>` : empty('No deployments','Verified bot commits will appear here.','rocket')}</div>
  </div>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-issue]').forEach((tr) => tr.onclick = () => window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: 'issue', id: tr.dataset.issue } })));
    },
  };
}
