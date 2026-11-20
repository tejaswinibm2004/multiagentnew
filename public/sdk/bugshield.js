/* BugShield widget SDK — shadow DOM, zero dependencies.
 * Endpoint resolution: data-endpoint attribute first, else the origin of this script tag.
 * (Regression fix: never assume this is the last script tag.)
 */
(function () {
  'use strict';
  if (window.__bugshieldLoaded) return;
  window.__bugshieldLoaded = true;

  var me = (function () {
    var list = Array.prototype.slice.call(document.scripts || []);
    return list.find(function (s) { return /bugshield\.js|bs\.js(\?|$)/.test(s.src || ''); })
      || document.currentScript || list[list.length - 1];
  })();

  var rawEndpoint = (me && me.getAttribute('data-endpoint')) || window.BUGSHIELD_ENDPOINT || '';
  var origin = '';
  try { origin = new URL(me.src).origin; } catch (e) {}
  var apiBase = rawEndpoint ? rawEndpoint.replace(/\/$/, '') : origin;
  var endpoint = /\/api\/v1\/issues$/.test(apiBase) ? apiBase : apiBase + '/api/v1/issues';
  var key = (me && me.getAttribute('data-key')) || window.BUGSHIELD_KEY || '';

  var errors = [], logs = [], net = [];
  window.addEventListener('error', function (e) {
    errors.push({ message: String(e.message || '').slice(0, 8000), stack: String(e.error && e.error.stack || '').slice(0, 8000) });
    if (errors.length > 20) errors.shift();
  });
  var origErr = console.error;
  console.error = function () {
    try { logs.push(Array.prototype.map.call(arguments, String).join(' ').slice(0, 500)); if (logs.length > 50) logs.shift(); } catch (e) {}
    return origErr.apply(console, arguments);
  };
  var origFetch = window.fetch;
  if (origFetch) window.fetch = function (url, opts) {
    return origFetch.apply(this, arguments).then(function (r) {
      try { net.push({ url: String(url).slice(0, 500), status: r.status }); if (net.length > 20) net.shift(); } catch (e) {}
      return r;
    });
  };

  var host = document.createElement('div');
  host.id = 'bugshield-widget';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });

  root.innerHTML = [
    '<style>',
    ':host{all:initial;font-family:Inter,system-ui,sans-serif}',
    '.trigger{position:fixed;right:22px;bottom:22px;width:56px;height:56px;border-radius:50%;border:0;background:#7c5cff;color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 10px 30px rgba(124,92,255,.45);z-index:2147483000;font-size:22px}',
    '.panel{position:fixed;right:22px;bottom:90px;width:min(400px,calc(100vw - 32px));background:#121621;color:#e8ebf5;border:1px solid #333d54;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.55);z-index:2147483000;overflow:hidden;display:none}',
    '.panel.open{display:block;animation:f .2s ease}',
    '@keyframes f{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '.hd{padding:15px 17px;border-bottom:1px solid #252c3d;display:flex;align-items:center;gap:9px;font-weight:700}',
    '.hd small{font-weight:400;color:#6f7893;margin-left:auto}',
    '.bd{padding:15px 17px;max-height:62vh;overflow:auto}',
    'label{font-size:11px;font-weight:650;color:#a3abc2;display:block;margin:10px 0 5px}',
    'input,textarea{width:100%;box-sizing:border-box;background:#0a0c11;color:#e8ebf5;border:1px solid #333d54;border-radius:8px;padding:9px 10px;font:inherit;font-size:13px;outline:none}',
    'textarea{resize:vertical;min-height:70px}',
    'input:focus,textarea:focus{border-color:#7c5cff}',
    '.row{display:flex;gap:8px;align-items:center}.grow{flex:1}',
    '.btn{border:0;border-radius:8px;padding:9px 13px;font:inherit;font-weight:650;cursor:pointer;background:#222a3a;color:#e8ebf5}',
    '.btn.primary{background:#7c5cff;color:#fff}.btn:disabled{opacity:.5}',
    '.cnt{font-size:10px;color:#6f7893;text-align:right}',
    'details{margin-top:10px;border-top:1px solid #252c3d;padding-top:8px}summary{cursor:pointer;font-size:12px;color:#a3abc2}',
    '.pill{display:inline-block;background:rgba(124,92,255,.16);color:#9d86ff;padding:3px 8px;border-radius:20px;font-size:11px}',
    '.msg{font-size:12px;margin-top:10px;padding:9px;border-radius:8px;background:#171c29;color:#a3abc2}',
    '.ok{color:#2dd4a7}.warn{color:#f5b74b}',
    '</style>',
    '<button class="trigger" title="Report a bug">🐞</button>',
    '<div class="panel" role="dialog"><div class="hd">🐞 Report a bug <small>BugShield</small></div><div class="bd">',
    '<div id="state"></div>',
    '<form id="f"><label>Title</label><input id="title" maxlength="300" placeholder="What went wrong?" required><div class="cnt"><span id="tc">0</span>/300</div>',
    '<label>Description</label><textarea id="desc" maxlength="4000" placeholder="What did you expect? What happened?" required></textarea><div class="cnt"><span id="dc">0</span>/4000</div>',
    '<label>Steps to reproduce</label><textarea id="steps" maxlength="2000" placeholder="1. Open page 2. Click…"></textarea><div class="cnt"><span id="sc">0</span>/2000</div>',
    '<div class="row" style="margin-top:10px"><button type="button" class="btn" id="point">◎ Point at the problem</button><span class="grow"></span><span id="picked" class="pill" hidden>element picked</span></div>',
    '<details><summary>Technical details</summary><label>Errors captured</label><div class="msg" id="errs">0</div><label>Console / network</label><div class="msg" id="logs">0 / 0</div></details>',
    '<div id="msg"></div>',
    '<div class="row" style="margin-top:14px"><button type="button" class="btn" id="cancel">Cancel</button><span class="grow"></span><button type="submit" class="btn primary" id="send">Send report</button></div>',
    '</form></div></div>'
  ].join('');

  var $ = (s) => root.querySelector(s);
  var picked = null;
  var pointing = false;

  function setState(html, cls) { $('#state').innerHTML = html ? '<div class="msg ' + (cls || '') + '">' + html + '</div>' : ''; }

  function updateCounters() {
    $('#tc').textContent = $('#title').value.length;
    $('#dc').textContent = $('#desc').value.length;
    $('#sc').textContent = $('#steps').value.length;
    $('#errs').textContent = String(errors.length);
    $('#logs').textContent = logs.length + ' / ' + net.length;
  }

  function onPoint(e) {
    if (!pointing) return;
    e.preventDefault(); e.stopPropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host || host.contains(el)) return;
    var box = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    picked = {
      selector: el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase()),
      outerHTML: String(el.outerHTML || '').slice(0, 2000),
      text: String(el.textContent || '').trim().slice(0, 500),
      box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
      styles: { color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize, display: cs.display },
    };
    pointing = false; document.removeEventListener('click', onPoint, true);
    $('#point').textContent = '◎ Point at the problem';
    $('#picked').hidden = false;
  }

  $('.trigger').onclick = function () {
    var p = $('.panel'); p.classList.toggle('open');
    if (p.classList.contains('open')) updateCounters();
  };
  $('#cancel').onclick = function () { $('.panel').classList.remove('open'); };
  $('#point').onclick = function () {
    pointing = !pointing;
    if (pointing) { $('#point').textContent = 'Click the element…'; document.addEventListener('click', onPoint, true); }
    else { $('#point').textContent = '◎ Point at the problem'; document.removeEventListener('click', onPoint, true); }
  };
  ['input', 'change'].forEach(function (ev) { $('#f').addEventListener(ev, updateCounters); });

  $('#f').onsubmit = function (e) {
    e.preventDefault();
    if (!key) { setState('Widget is misconfigured: no ingestion key. Ask the site owner to set BUGSHIELD_KEY.', 'warn'); return; }
    var btn = $('#send'); btn.disabled = true; btn.textContent = 'Sending…'; setState('');
    var payload = {
      key: key, title: $('#title').value.trim(), description: $('#desc').value.trim(),
      steps: $('#steps').value.trim(), page: location.pathname,
      reporter: 'visitor@' + location.hostname,
      selector: picked && picked.selector, outerHTML: picked && picked.outerHTML,
      text: picked && picked.text, box: picked && picked.box, styles: picked && picked.styles,
      errors: errors, console: logs, network: net,
    };
    var timer = setTimeout(function () { setState('Still sending…', ''); }, 4000);
    fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      clearTimeout(timer);
      if (r.status === 429) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          var wait = Number(r.headers.get('Retry-After') || 60);
          setState('Too many reports. Try again in <b>' + wait + 's</b>.', 'warn');
        });
      }
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) {
        setState('Could not send: ' + (d.error || r.status), 'warn');
      });
      return r.json().then(function (d) {
        setState(d.deduplicated
          ? 'DUPLICATED — this issue was already reported and is being tracked.'
          : 'RECEIVED — thanks! Tracking ID <b>' + (d.issueKey || d.issueId) + '</b>.', 'ok');
        $('#f').reset(); picked = null; $('#picked').hidden = true; updateCounters();
      });
    }).catch(function (err) { clearTimeout(timer); setState('Network error: ' + err.message, 'warn'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'Send report'; });
  };
})();
