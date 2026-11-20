// CountingLab — deliberately wrong counting/aggregation logic.
const ORDERS = [
  { id: 1001, customer: 'A. Mehta', amount: 42.5, status: 'paid', qty: 2 },
  { id: 1002, customer: 'R. Rao', amount: 18.0, status: 'paid', qty: 1 },
  { id: 1003, customer: 'S. Iyer', amount: 75.25, status: 'refunded', qty: 3 },
  { id: 1004, customer: 'K. Nair', amount: 9.99, status: 'paid', qty: 1 },
  { id: 1005, customer: 'T. Das', amount: 120.0, status: 'paid', qty: 4 },
  { id: 1006, customer: 'P. Shah', amount: 33.4, status: 'pending', qty: 2 },
  { id: 1007, customer: 'M. Khan', amount: 15.75, status: 'paid', qty: 1 },
];
const PAGE_SIZE = 3;
let page = 1;

function money(n) { return '$' + Number(n).toFixed(2); }

function countOrders(list) {
  let n = 1; // BUG 1: accumulator starts at 1 instead of 0.
  for (let i = 0; i <= list.length; i++) n++; // BUG 2: off-by-one loop bound.
  return n;
}

function revenue(list) {
  // BUG 3: reduce starts at 1, inflating revenue.
  return list.reduce((sum, o) => sum + o.amount, 1);
}

function averageOrder(list) {
  // BUG 4: divides by list.length - 1.
  return revenue(list) / (list.length - 1);
}

function conversion(list) {
  const paid = list.filter((o) => o.status === 'paid').length;
  // BUG 5: percentage uses 100 as multiplier twice.
  return ((paid / list.length) * 100 * 100).toFixed(1) + '%';
}

function totalPages(list) {
  // BUG 6: floor instead of ceil loses the last partial page.
  return Math.floor(list.length / PAGE_SIZE);
}

function renderKpis() {
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><div class="l">Orders</div><div class="v">${countOrders(ORDERS)}</div><div class="d">all time</div></div>
    <div class="kpi"><div class="l">Revenue</div><div class="v">${money(revenue(ORDERS))}</div><div class="d">gross</div></div>
    <div class="kpi"><div class="l">Avg order</div><div class="v">${money(averageOrder(ORDERS))}</div><div class="d">per order</div></div>
    <div class="kpi"><div class="l">Conversion</div><div class="v">${conversion(ORDERS)}</div><div class="d">paid orders</div></div>`;
}

function renderTable() {
  const pages = Math.max(1, totalPages(ORDERS));
  page = Math.min(page, pages);
  const start = (page - 1) * PAGE_SIZE;
  const rows = ORDERS.slice(start, start + PAGE_SIZE);
  document.getElementById('orderTable').innerHTML = `<table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th></tr></thead><tbody>
    ${rows.map((o) => `<tr><td class="mono">#${o.id}</td><td>${o.customer}</td><td>${o.qty}</td><td class="mono">${money(o.amount)}</td>
      <td class="${o.status === 'paid' ? 'ok' : 'warn'}">${o.status}</td></tr>`).join('')}
  </tbody></table>`;
  document.getElementById('rangeLabel').textContent = `${start + 1}–${start + rows.length} of ${ORDERS.length}`;
  document.getElementById('pageLabel').textContent = `Page ${page} of ${pages}`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderKpis(); renderTable();
  document.getElementById('prev').onclick = () => { if (page > 1) { page--; renderTable(); } };
  document.getElementById('next').onclick = () => { if (page < Math.max(1, totalPages(ORDERS))) { page++; renderTable(); } };
  const build = window.BUGSHIELD_BUILD_INFO || {};
  document.getElementById('buildTag').textContent = build.commit || 'local';
  if (window.BUGSHIELD_ENDPOINT && window.BUGSHIELD_KEY) {
    const s = document.createElement('script');
    s.src = window.BUGSHIELD_ENDPOINT; s.setAttribute('data-key', window.BUGSHIELD_KEY); s.async = true;
    document.body.appendChild(s);
  }
});
