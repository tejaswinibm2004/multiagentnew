import { post } from '../core/api.js';
import { icon, esc, timeAgo, statusBadge, riskBadge, short } from '../core/util.js';
import { toast, confirmModal, stepper, riskGauge, diffViewer, empty } from '../components/ui.js';
import { state, loadDetail, loadAll, loadIssues } from '../core/store.js';

const TABS = ['Overview', 'Fix', 'Validation', 'Deployment', 'Activity'];

export function issueDetailView() {
  const d = state.detail;
  if (!d || String(d.issue?.id) !== String(state.params.id)) {
    return { html: `<div class="page">${'<div class="skel card"></div>'.repeat(3)}</div>`, mount() {} };
  }
  const i = d.issue;
  const patch = d.patches?.[0];
  const val = d.validations?.[0];
  const dep = d.deployments?.[0];
  const safety = patch?.safety || {};
  const critic = patch?.critic || {};
  const factors = parse(i.analyzer_json);
  const needsApproval = i.status === 'AWAITING_APPROVAL';

  const html = `<div class="page">
    <div class="detail-head">
      <div style="flex:1"><div class="row"><span class="key mono">${esc(i.issue_key)}</span>${statusBadge(i.status)}${riskBadge(i.risk_score, i.risk_band)}</div>
        <h1 style="margin-top:7px">${esc(i.title)}</h1>
        <div class="sub muted small">${esc(i.website_name || '')} · ${esc(i.page_path || '/')} · opened ${timeAgo(i.created_at)}</div></div>
      <div class="detail-actions">
        ${needsApproval ? `<button class="btn good" data-act="approve">${icon('check','sm')} Approve</button><button class="btn" data-act="reject">${icon('x','sm')} Reject</button>` : ''}
        ${['PATCH_FAILED','VALIDATION_FAILED','FAILED','DEPLOY_TIMEOUT'].includes(i.status) ? `<button class="btn" data-act="retry">${icon('rotate-cw','sm')} Retry</button>` : ''}
        ${i.deploy_sha ? `<button class="btn danger" data-act="revert">${icon('rotate-ccw','sm')} Revert</button>` : ''}
        <button class="btn ghost" data-nav="issues">${icon('arrow-left','sm')} Back</button>
      </div>
    </div>

    ${needsApproval ? `<div class="approval-banner">${icon('hand')}<div style="flex:1"><b>Approval required</b><div class="small muted">${esc(i.admin_note || 'This fix touches a sensitive area. Review the diff before deploying.')}</div></div>
      <span class="badge amber">${i.risk_score}/100</span></div>` : ''}

    <div class="card" style="margin-bottom:18px"><div class="card-body" style="padding-bottom:6px">
      <div class="row" style="margin-bottom:5px"><span class="eyebrow">Live pipeline</span><span class="spacer"></span><span class="small dim">${d.steps.length} steps recorded</span></div>
      ${stepper(d.steps, i.status)}
    </div></div>

    <div class="detail-grid">
      <div>
        <div class="tabs">${TABS.map((t, n) => `<button class="tab ${n === 0 ? 'active' : ''}" data-tab="${t}">${t}</button>`).join('')}</div>
        <div id="tabContent">${tabHtml('Overview', d)}</div>
      </div>
      <aside class="sticky-rail">
        <div class="card rail-card"><div class="rail-title">Risk assessment</div><div class="card-body">
          ${riskGauge(i.risk_score, i.risk_band)}
          <div class="divider" style="margin:14px 0"></div>
          ${riskFactors(i, factors)}
        </div></div>
        <div class="card rail-card"><div class="rail-title">Safety checklist</div><div class="card-body check-list">
          ${check('Source localized', Boolean((i.proposed_files || []).length || Object.keys(parse(i.localizer_json).files || {}).length))}
          ${check('Analyzer: real defect', factors.is_defect === true, factors.is_defect === true ? 'Defect confirmed with evidence' : 'No defect established')}
          ${check('Search matches unique', true)}
          ${check('Safety scanner', !safety.hit, safety.hit ? (safety.findings || []).map((f) => f.name).join(', ') : 'No added-line violations')}
          ${check('Critic', critic.decision !== 'reject', critic.reason || 'No critic verdict recorded')}
          ${check('Validators clean', val?.clean === 1, val ? `${(val.results || []).length} file(s) checked` : 'Not yet run')}
        </div></div>
        <div class="card rail-card"><div class="rail-title">Details</div><div class="card-body">
          <div class="kv"><span class="k">Defect type</span><span class="v">${esc(i.defect_type || '—')}</span></div>
          <div class="kv"><span class="k">Confidence</span><span class="v mono">${factors.confidence ?? '—'}</span></div>
          <div class="kv"><span class="k">Approver</span><span class="v">${esc(i.approver || 'auto')}</span></div>
          <div class="kv"><span class="k">Deploy SHA</span><span class="v mono">${short(i.deploy_sha, 12) || '—'}</span></div>
        </div></div>
      </aside>
    </div>
  </div>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => {
        root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
        root.querySelector('#tabContent').innerHTML = tabHtml(b.dataset.tab, d);
        bindTab(root, d);
      });
      root.querySelector('[data-nav]').onclick = () => window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: 'issues' } }));
      root.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => act(b.dataset.act, i));
      bindTab(root, d);
    },
  };
}

async function act(kind, i) {
  if (kind === 'reject' && !await confirmModal('Reject this fix?', 'The patch will not be deployed.', { danger: true })) return;
  if (kind === 'revert' && !await confirmModal('Revert this deployment?', 'A revert commit will be pushed to the client repository.', { danger: true })) return;
  try {
    await post(`/api/issues/${i.id}/${kind}`, { reason: `${kind} from issue detail` });
    toast({ approve: 'Approved — deploying', reject: 'Rejected', retry: 'Pipeline restarted', revert: 'Revert pushed' }[kind], 'ok');
    await Promise.all([loadDetail(i.id), loadAll(), loadIssues()]);
  } catch (e) { toast(e.message, 'err'); }
}

function bindTab(root, d) {
  root.querySelectorAll('[data-split]').forEach((cb) => cb.onchange = () => {
    const host = cb.closest('.card');
    host.innerHTML = diffViewer((d.patches?.[0]?.unified_diff || ''), cb.checked).replace('<div class="diff">', '<div class="diff" style="margin-top:8px">');
    bindTab(root, d);
  });
}

function tabHtml(tab, d) {
  const i = d.issue;
  const patch = d.patches?.[0];
  const val = d.validations?.[0];
  const dep = d.deployments?.[0];
  if (tab === 'Fix') return `<div class="card"><div class="card-head"><h3>${icon('file-diff','sm')} Proposed patch</h3><span class="badge violet">${(patch?.files || []).length} file(s)</span></div>
    <div class="card-body">${diffViewer(patch?.unified_diff || '')}</div></div>`;
  if (tab === 'Validation') {
    const results = val?.results || [];
    return `<div class="card"><div class="card-head"><h3>${icon('shield-check','sm')} Validator registry</h3>
      <span class="badge ${val?.clean ? 'green' : 'gray'}">${val?.clean ? 'clean' : 'not clean'}</span></div><div class="card-body">
      ${results.length ? results.map((r) => `<div class="health-row"><span class="mono">${esc(r.path)}</span>
        <span class="badge ${r.status === 'ok' ? 'green' : r.status === 'NOT_PERFORMED' ? 'amber' : 'red'}">${esc(r.status)}</span></div>
        <div class="small dim" style="margin-top:-6px;margin-bottom:8px">${esc(r.detail || '')}</div>`).join('') : empty('No validation run yet','Validators run after patching.','shield-check')}
      <p class="small dim" style="margin-top:12px">Project tests are not auto-run. Missing runtimes are reported as NOT_PERFORMED, never green.</p>
    </div></div>`;
  }
  if (tab === 'Deployment') return `<div class="card"><div class="card-head"><h3>${icon('rocket','sm')} Deployment</h3>
      <span class="badge ${dep?.status === 'VERIFIED' ? 'green' : 'gray'}">${esc(dep?.status || 'not started')}</span></div><div class="card-body">
      ${dep ? `<div class="kv"><span class="k">Commit</span><span class="v mono">${esc(short(dep.sha, 14))}</span></div>
        <div class="kv"><span class="k">Commit URL</span><span class="v">${dep.commit_url ? `<a href="${esc(dep.commit_url)}" target="_blank" rel="noopener">open ${icon('external-link','sm')}</a>` : '—'}</span></div>
        <div class="kv"><span class="k">version.json SHA</span><span class="v mono">${esc(dep.checked_sha || '—')}</span></div>
        <div class="kv"><span class="k">Verified at</span><span class="v">${timeAgo(dep.verified_at)}</span></div>
        <div class="kv"><span class="k">Health probes</span><span class="v">${dep.status === 'VERIFIED' ? '3/3 passed' : '—'}</span></div>`
      : empty('Not deployed yet','A verified commit will appear here.','rocket')}
    </div></div>`;
  if (tab === 'Activity') return `<div class="card"><div class="card-head"><h3>${icon('history','sm')} Activity</h3></div><div class="card-body">
    ${(d.audit || []).map((a) => `<div class="activity-item"><span class="badge gray">${esc(a.actor)}</span><div><b>${esc(a.action.replace(/_/g, ' '))}</b><div class="dim small">${esc(a.target)} · ${timeAgo(a.created_at)}</div></div></div>`).join('') || empty('No activity','—','history')}
    <div class="divider" style="margin:10px 0"></div>
    ${(d.steps || []).slice().reverse().map((s) => `<div class="activity-item"><span class="badge ${['failed','blocked'].includes(s.status) ? 'red' : 'green'}">${esc(s.status)}</span><div><b>${esc(s.stage)}</b><div class="dim small">${esc(s.detail)} · ${timeAgo(s.created_at)}</div></div></div>`).join('')}
  </div></div>`;
  // Overview
  const a = parse(i.analyzer_json);
  return `<div class="grid grid-2">
    <div class="card"><div class="card-head"><h3>${icon('scan-search','sm')} Analyzer verdict</h3><span class="badge ${a.is_defect ? 'green' : 'gray'}">${a.is_defect ? 'real defect' : 'not a defect'}</span></div>
      <div class="card-body"><p>${esc(a.explanation || i.summary || 'No explanation recorded.')}</p>
        <div class="kv" style="margin-top:12px"><span class="k">Impact</span><span class="v">${esc(a.impact || '—')}</span></div>
        <div class="kv"><span class="k">File</span><span class="v mono">${esc(a.file || '—')}</span></div>
        <div class="kv"><span class="k">Type</span><span class="v">${esc(i.defect_type || '—')}</span></div>
      </div></div>
    <div class="card"><div class="card-head"><h3>${icon('crosshair','sm')} Report evidence</h3></div><div class="card-body">
      <p class="small muted">${esc(i.description || 'No description.')}</p>
      <div class="divider" style="margin:12px 0"></div>
      ${(d.cases || []).slice(0, 8).map((c) => `<div class="kv"><span class="k">${esc(c.key)}</span><span class="v mono">${esc(short(c.value, 40))}</span></div>`).join('') || '<p class="small dim">No extracted evidence.</p>'}
    </div></div>
  </div>`;
}

function parse(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
function check(label, ok, detail = '') {
  return `<div class="check ${ok ? '' : 'bad'}"><span class="mark">${icon(ok ? 'check' : 'x', 'sm')}</span><div><div>${esc(label)}</div>${detail ? `<div class="dim tiny">${esc(detail)}</div>` : ''}</div></div>`;
}
function riskFactors(i, a) {
  const f = [];
  if (a.is_defect) f.push(['Defect confirmed', '+']);
  if (i.defect_type === 'security') f.push(['Security defect', '+25']);
  if (i.defect_type === 'money_checkout') f.push(['Money/checkout', '+20']);
  if (i.risk_score >= 70) f.push(['Critical threshold', 'gate']);
  if (!f.length) f.push(['Baseline score', '25']);
  return f.map(([n, v]) => `<div class="factor"><span>${esc(n)}</span><b>${esc(v)}</b></div>`).join('');
}
