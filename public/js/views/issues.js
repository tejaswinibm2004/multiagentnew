import { api } from '../core/api.js';
import { icon, esc, timeAgo, statusBadge, riskBadge } from '../core/util.js';
import { toast, empty, modal } from '../components/ui.js';
import { state, emit } from '../core/store.js';

const SAVED = [
  { label: 'All issues', f: { status: 'all', website_id: 'all', risk: 'all', search: '' } },
  { label: 'Needs approval', f: { status: 'AWAITING_APPROVAL', website_id: 'all', risk: 'all', search: '' } },
  { label: 'Critical risk', f: { status: 'all', website_id: 'all', risk: 'critical', search: '' } },
  { label: 'Live fixes', f: { status: 'RESOLVED_AND_DEPLOYED', website_id: 'all', risk: 'all', search: '' } },
];

export function issuesView() {
  const f = state.issuesFilter;
  const siteOpts = (state.websites || []).map((w) => `<option value="${w.id}" ${String(f.website_id) === String(w.id) ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
  const stageOpts = ['all', 'RECEIVED', 'TRIAGING', 'ANALYZING', 'PATCHING', 'VALIDATING', 'AWAITING_APPROVAL', 'PUSHING', 'DEPLOYING', 'RESOLVED_AND_DEPLOYED', 'INVALID_REPORT', 'FAILED'].map((s) => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s === 'all' ? 'All stages' : s.replace(/_/g, ' ')}</option>`).join('');

  const html = `<div class="page">
    <div class="page-head"><div><div class="eyebrow">Triage workspace</div><h1>Issues</h1><div class="sub">Every report, its stage, and the evidence behind the decision.</div></div>
      <div class="row"><button class="btn sm" id="exportCsv">${icon('download','sm')} Export CSV</button>
        <select class="select" id="savedView" style="width:auto">${SAVED.map((s, n) => `<option value="${n}">${s.label}</option>`).join('')}</select></div>
    </div>
    <div class="card" style="padding:12px 14px; margin-bottom:14px">
      <div class="row wrap">
        <select class="select" id="fStage" style="width:190px">${stageOpts}</select>
        <select class="select" id="fSite" style="width:190px"><option value="all">All sites</option>${siteOpts}</select>
        <button class="chip ${f.risk === 'critical' ? 'active' : ''}" id="fRisk">${icon('flame','sm')} Critical</button>
        <input class="input" id="fSearch" placeholder="Search title or ID…" value="${esc(f.search)}" style="max-width:280px">
        <span class="spacer"></span><span class="small dim"><span id="rowCount">${(state.issues || []).length}</span> shown</span>
      </div>
    </div>
    <div class="table-wrap" id="issuesTable">${rowsHtml(state.issues || [])}</div>
    <div class="drawer" id="issueDrawer"></div>
  </div>`;

  return {
    html,
    mount(root) {
      const refresh = async () => {
        const q = new URLSearchParams({ status: f.status, website_id: f.website_id, ...(f.risk === 'critical' ? { risk: 'critical' } : {}), ...(f.search ? { search: f.search } : {}) });
        try {
          const r = await api('/api/issues?' + q);
          emit({ issues: r.issues }, true);
          root.querySelector('#issuesTable').innerHTML = rowsHtml(r.issues);
          root.querySelector('#rowCount').textContent = r.issues.length;
          bindRows(root);
        } catch (e) { toast(e.message, 'err'); }
      };
      const bindRows = (r) => {
        r.querySelectorAll('[data-issue]').forEach((tr) => tr.onclick = () => openDrawer(tr.dataset.issue));
        r.querySelectorAll('[data-select]').forEach((cb) => cb.onchange = () => {
          document.getElementById('selCount').textContent = r.querySelectorAll('[data-select]:checked').length;
        });
      };
      root.querySelector('#fStage').onchange = (e) => { f.status = e.target.value; refresh(); };
      root.querySelector('#fSite').onchange = (e) => { f.website_id = e.target.value; refresh(); };
      root.querySelector('#fRisk').onclick = (e) => { f.risk = f.risk === 'critical' ? 'all' : 'critical'; e.currentTarget.classList.toggle('active'); refresh(); };
      let t;
      root.querySelector('#fSearch').oninput = (e) => { f.search = e.target.value; clearTimeout(t); t = setTimeout(refresh, 260); };
      root.querySelector('#savedView').onchange = (e) => {
        Object.assign(f, SAVED[Number(e.target.value)].f);
        root.querySelector('#fStage').value = f.status; root.querySelector('#fSite').value = f.website_id;
        root.querySelector('#fSearch').value = f.search; root.querySelector('#fRisk').classList.toggle('active', f.risk === 'critical');
        refresh();
      };
      root.querySelector('#exportCsv').onclick = () => exportCsv(state.issues || []);
      bindRows(root);
    },
  };
}

function rowsHtml(issues) {
  if (!issues.length) return empty('No matching issues', 'Try changing a filter.','filter');
  return `<table class="tbl"><thead><tr>
    <th style="width:34px"><input type="checkbox" data-select></th><th>Issue</th><th>Title</th><th>Site</th><th>Stage</th><th>Risk</th><th>Updated</th></tr></thead><tbody>
    ${issues.map((i) => `<tr data-issue="${i.id}"><td><input type="checkbox" data-select onclick="event.stopPropagation()"></td>
      <td class="key">${esc(i.issue_key)}</td><td class="ttl">${esc(i.title)}${i.occurrences > 1 ? ` <span class="badge gray">×${i.occurrences}</span>` : ''}</td>
      <td>${esc(i.website_name || '—')}</td><td>${statusBadge(i.status)}</td><td>${riskBadge(i.risk_score, i.risk_band)}</td><td class="dim small">${timeAgo(i.updated_at)}</td></tr>`).join('')}
  </tbody></table>`;
}

async function openDrawer(id) {
  const drawer = document.getElementById('issueDrawer');
  drawer.innerHTML = `<div class="card-head"><h3>Loading…</h3></div>${'<div class="card-body">' + '<div class="skel line"></div>'.repeat(6) + '</div>'}`;
  drawer.classList.add('open');
  try {
    const d = await api('/api/issues/' + id);
    const i = d.issue;
    const lastPatch = d.patches?.[0];
    drawer.innerHTML = `<div class="card-head"><div><div class="key mono">${esc(i.issue_key)}</div><h3>${esc(i.title)}</h3></div>
        <button class="icon-btn" id="closeDrawer">${icon('x')}</button></div>
      <div class="card-body">
        <div class="row wrap" style="margin-bottom:14px">${statusBadge(i.status)}${riskBadge(i.risk_score, i.risk_band)}<span class="chip">${esc(i.defect_type || '—')}</span></div>
        <p class="muted small">${esc(i.summary || i.description || '')}</p>
        <div class="divider" style="margin:16px 0"></div>
        <div class="kv"><span class="k">Site</span><span class="v">${esc(i.website_name || '—')}</span></div>
        <div class="kv"><span class="k">Reported by</span><span class="v">${esc(i.reporter || 'visitor')}</span></div>
        <div class="kv"><span class="k">Opened</span><span class="v">${timeAgo(i.created_at)}</span></div>
        <div class="kv"><span class="k">Approver</span><span class="v">${esc(i.approver || '—')}</span></div>
        <div class="kv"><span class="k">Deploy SHA</span><span class="v mono">${esc(i.deploy_sha || '—')}</span></div>
        ${lastPatch ? `<div style="margin-top:14px"><h3 class="small" style="margin-bottom:8px">Proposed change</h3><div class="mini-diff">${esc(lastPatch.unified_diff || '').split('\n').slice(0, 8).join('\n')}</div></div>` : ''}
        <button class="btn primary block" id="openFull" style="margin-top:18px">${icon('maximize-2','sm')} Open full detail</button>
      </div>`;
    drawer.querySelector('#closeDrawer').onclick = () => drawer.classList.remove('open');
    drawer.querySelector('#openFull').onclick = () => window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: 'issue', id } }));
  } catch (e) { toast(e.message, 'err'); }
}

function exportCsv(issues) {
  const head = ['key', 'title', 'site', 'stage', 'risk', 'defect_type', 'created_at'];
  const rows = issues.map((i) => [i.issue_key, i.title, i.website_name, i.status, i.risk_score, i.defect_type, i.created_at]);
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'bugshield-issues.csv'; a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exported', 'ok');
}
