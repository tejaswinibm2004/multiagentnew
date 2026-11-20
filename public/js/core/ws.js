import { emit, state } from './store.js';
import { loadAll, loadIssues, loadDetail } from './store.js';
import { toast } from '../components/ui.js';

let ws = null;
let retries = 0;

export function connectWs() {
  if (!state.user) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try { ws = new WebSocket(`${proto}//${location.host}/ws`); } catch { return; }
  ws.onopen = () => { retries = 0; emit({ live: true }); };
  ws.onclose = () => {
    emit({ live: false });
    if (state.user) setTimeout(connectWs, Math.min(15000, 1000 * 2 ** retries++));
  };
  ws.onmessage = (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'hello') return;
    const p = msg.payload || {};
    if (msg.type === 'step' && state.detail?.issue?.id === p.issueId) loadDetail(p.issueId).catch(() => {});
    if (msg.type === 'issue' || msg.type === 'website') {
      loadAll().catch(() => {});
      if (state.view === 'issues' || state.view === 'inbox') loadIssues().catch(() => {});
    }
    if (p?.issue?.status === 'AWAITING_APPROVAL') toast('New fix needs your approval', 'info');
  };
}
