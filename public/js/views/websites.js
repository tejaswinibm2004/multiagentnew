import { api, post } from '../core/api.js';
import { icon, esc } from '../core/util.js';
import { toast, modal, empty } from '../components/ui.js';
import { state, loadAll } from '../core/store.js';

export function websitesView() {
  const sites = state.websites || [];
  const html = `<div class="page">
    <div class="page-head"><div><div class="eyebrow">Client integrations</div><h1>Websites</h1>
      <div class="sub">Connect a Git repo and a live URL. BugShield reads source there and commits fixes back.</div></div>
      <button class="btn primary" id="newSite">${icon('plus','sm')} Connect website</button></div>
    <div class="grid grid-3" id="siteGrid">
      ${sites.length ? sites.map(siteCard).join('') : empty('No sites connected','Add your first client website to begin.','globe')}
    </div>
  </div>`;
  return {
    html,
    mount(root) {
      root.querySelector('#newSite').onclick = () => wizard();
      root.querySelectorAll('[data-test]').forEach((b) => b.onclick = async () => {
        b.disabled = true;
        try {
          const r = await post(`/api/websites/${b.dataset.test}/test`, {});
          toast(r.ok ? `Repo readable — ${r.fileCount} files mapped` : `Repo check: ${r.reason || 'unavailable'}`, r.ok ? 'ok' : 'info');
        } catch (e) { toast(e.message, 'err'); }
        b.disabled = false;
      });
      root.querySelectorAll('[data-keys]').forEach((b) => b.onclick = async () => {
        try {
          const r = await post(`/api/websites/${b.dataset.keys}/keys`, { label: 'Dashboard generated' });
          modal({ title: 'Ingestion key', body: `<p class="muted small">Copy this key into your client config. It is shown once.</p><div class="mini-diff" style="margin-top:12px">${esc(r.key)}</div>` });
        } catch (e) { toast(e.message, 'err'); }
      });
      root.querySelectorAll('[data-detail]').forEach((b) => b.onclick = () => window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: 'website', id: b.dataset.detail } })));
    },
  };
}

function siteCard(w) {
  return `<article class="card site-card">
    <div class="site-top"><div class="site-ico">${icon('globe')}</div><div style="flex:1"><h3>${esc(w.name)}</h3><div class="key mono tiny">${esc(w.repo_full_name)}</div></div>
      <span class="badge ${w.live_url ? 'green' : 'gray'}">${w.live_url ? 'live' : 'no URL'}</span></div>
    <div class="site-stats"><div><b>${w.stats?.issues || 0}</b><span>issues</span></div><div><b>${w.stats?.fixed || 0}</b><span>fixed</span></div><div><b>${w.keyCount || 0}</b><span>keys</span></div></div>
    <div class="row wrap"><span class="chip">${icon('shield', 'sm')} ${w.always_approve ? 'always approve' : w.auto_deploy ? 'auto-deploy' : 'manual'}</span>
      <span class="chip">${icon('git-branch','sm')} ${esc(w.branch)}</span></div>
    <div class="row"><button class="btn sm" data-test="${w.id}">${icon('plug-zap','sm')} Test repo</button>
      <button class="btn sm" data-keys="${w.id}">${icon('key-round','sm')} New key</button>
      <span class="spacer"></span><button class="btn ghost sm" data-detail="${w.id}">Details ${icon('arrow-right','sm')}</button></div>
  </article>`;
}

export function websiteDetailView() {
  const w = (state.websites || []).find((x) => String(x.id) === String(state.params.id));
  if (!w) return { html: `<div class="page">${empty('Website not found','It may have been removed.','globe')}</div>`, mount() {} };
  const html = `<div class="page">
    <div class="page-head"><div><div class="eyebrow">Client configuration</div><h1>${esc(w.name)}</h1><div class="sub">${esc(w.repo_full_name)} · ${esc(w.branch)}</div></div>
      <button class="btn ghost" data-back>${icon('arrow-left','sm')} All websites</button></div>
    <div class="grid grid-2">
      <div class="card"><div class="card-head"><h3>${icon('link','sm')} Connection</h3></div><div class="card-body">
        <div class="kv"><span class="k">Live URL</span><span class="v"><a href="${esc(w.live_url)}" target="_blank" rel="noopener">${esc(w.live_url || '—')}</a></span></div>
        <div class="kv"><span class="k">version.json</span><span class="v mono">${esc(w.version_json_url || '—')}</span></div>
        <div class="kv"><span class="k">Allowed origins</span><span class="v mono">${esc((w.allowed_origins || []).join(', '))}</span></div>
        <div class="kv"><span class="k">Health URLs</span><span class="v mono">${esc((w.health_urls || []).join(', '))}</span></div>
      </div></div>
      <div class="card"><div class="card-head"><h3>${icon('sliders-horizontal','sm')} Policy</h3></div><div class="card-body">
        <div class="health-row"><span>Auto-deploy non-critical fixes</span><span class="badge ${w.auto_deploy ? 'green' : 'amber'}">${w.auto_deploy ? 'on' : 'off'}</span></div>
        <div class="health-row"><span>Always require approval</span><span class="badge ${w.always_approve ? 'amber' : 'gray'}">${w.always_approve ? 'yes' : 'no'}</span></div>
        <div class="health-row"><span>Ingestion keys</span><b>${w.keyCount || 0}</b></div>
      </div></div>
    </div>
  </div>`;
  return { html, mount(root) { root.querySelector('[data-back]').onclick = () => window.dispatchEvent(new CustomEvent('bs:navigate', { detail: { view: 'websites' } })); } };
}

function wizard() {
  let step = 0;
  const data = { name: '', repo_full_name: '', branch: 'main', live_url: '', version_json_url: '', allowed_origins: '', always_approve: false, auto_deploy: true };
  const render = (m) => {
    const body = m.el.querySelector('.modal-body');
    const foot = m.el.querySelector('.modal-foot');
    m.el.querySelector('.modal-head h3').textContent = 'Connect a website';
    const stepHtml = `<div class="wiz-steps">${['Basics', 'Connection', 'Review'].map((s, n) => `<div class="ws ${n === step ? 'active' : n < step ? 'done' : ''}">${n < step ? '✓ ' : `${n + 1}. `}${s}</div>`).join('')}</div>`;
    let form = '';
    if (step === 0) form = `<div class="field" style="margin-bottom:14px"><label>Display name</label><input class="input" id="wName" placeholder="Amazin Demo Shop" value="${esc(data.name)}"></div>
      <div class="field"><label>GitHub repo (owner/name)</label><input class="input" id="wRepo" placeholder="your-org/shop-re-test" value="${esc(data.repo_full_name)}"></div>`;
    if (step === 1) form = `<div class="field" style="margin-bottom:12px"><label>Live URL</label><input class="input" id="wUrl" placeholder="https://shop.onrender.com" value="${esc(data.live_url)}"></div>
      <div class="field" style="margin-bottom:12px"><label>version.json URL</label><input class="input" id="wVer" placeholder="https://shop.onrender.com/version.json" value="${esc(data.version_json_url)}"></div>
      <div class="field" style="margin-bottom:12px"><label>Branch</label><input class="input" id="wBranch" value="${esc(data.branch)}"></div>
      <div class="field"><label>Allowed origins (comma separated)</label><input class="input" id="wOrigins" placeholder="https://shop.onrender.com" value="${esc(data.allowed_origins)}"></div>`;
    if (step === 2) form = `<div class="kv"><span class="k">Name</span><span class="v">${esc(data.name)}</span></div>
      <div class="kv"><span class="k">Repo</span><span class="v mono">${esc(data.repo_full_name)} (${esc(data.branch)})</span></div>
      <div class="kv"><span class="k">Live URL</span><span class="v">${esc(data.live_url)}</span></div>
      <div class="kv"><span class="k">Auto-deploy</span><span class="v">${data.auto_deploy ? 'on for non-critical' : 'off'}</span></div>
      <div class="kv"><span class="k">Always approve</span><span class="v">${data.always_approve ? 'yes' : 'no'}</span></div>`;
    body.innerHTML = stepHtml + form;
    foot.innerHTML = `${step > 0 ? '<button class="btn ghost" data-prev>Back</button>' : ''}<span class="spacer"></span>
      <button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" data-next>${step === 2 ? 'Connect website' : 'Continue'}</button>`;
    const grab = () => {
      if (step === 0) { data.name = body.querySelector('#wName').value; data.repo_full_name = body.querySelector('#wRepo').value; }
      if (step === 1) { data.live_url = body.querySelector('#wUrl').value; data.version_json_url = body.querySelector('#wVer').value; data.branch = body.querySelector('#wBranch').value; data.allowed_origins = body.querySelector('#wOrigins').value; }
    };
    foot.querySelector('[data-cancel]').onclick = () => m.close();
    foot.querySelector('[data-prev]')?.addEventListener('click', () => { grab(); step--; render(m); });
    foot.querySelector('[data-next]').onclick = async () => {
      grab();
      if (step < 2) { step++; render(m); return; }
      try {
        await post('/api/websites', { ...data, allowed_origins: data.allowed_origins.split(',').map((s) => s.trim()).filter(Boolean), health_urls: data.live_url ? [data.live_url] : [] });
        m.close(); toast('Website connected', 'ok'); await loadAll();
      } catch (e) { toast(e.message, 'err'); }
    };
  };
  const m = modal({ title: 'Connect a website', body: '', foot: '', wide: false });
  render(m);
}
