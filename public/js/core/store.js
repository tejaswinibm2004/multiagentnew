import { api } from './api.js';

const listeners = new Set();
export const state = {
  user: null,
  booted: false,
  view: 'overview',
  params: {},
  issues: [], stats: null, websites: [], audit: [], members: [], integrations: null, policy: null,
  detail: null, loading: false, theme: localStorage.getItem('bs-theme') || 'system',
  issuesFilter: { status: 'all', website_id: 'all', risk: 'all', search: '' },
  selectedApproval: 0,
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(patch = {}, silent = false) {
  Object.assign(state, patch);
  if (silent) return;
  for (const fn of listeners) fn(state);
}

export async function loadAll() {
  try {
    const [me, stats, sites, audit, integ, policy, members] = await Promise.all([
      api('/auth/me'), api('/api/stats/overview'), api('/api/websites'),
      api('/api/audit'), api('/api/settings/integrations-status'), api('/api/settings/policy'),
      api('/api/members'),
    ]);
    emit({ user: me.user, stats: stats.stats, websites: sites.websites, audit: audit.audit, integrations: integ.integrations, policy: policy.policy, members: members.members, booted: true });
  } catch (e) {
    if (e.status === 401) emit({ user: null, booted: true });
    else throw e;
  }
}

export async function loadIssues() {
  const f = state.issuesFilter;
  const q = new URLSearchParams({ status: f.status, website_id: f.website_id, ...(f.risk === 'critical' ? { risk: 'critical' } : {}), ...(f.search ? { search: f.search } : {}) });
  const r = await api('/api/issues?' + q);
  emit({ issues: r.issues });
}

export async function loadDetail(id) {
  const d = await api('/api/issues/' + id);
  emit({ detail: d });
  return d;
}
