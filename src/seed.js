import crypto from 'node:crypto';
import { get, query, insertGetId, dialect } from './db/db.js';
import { sha256 } from './config.js';
import { nowIso } from './util.js';

const STEPS = ['INTAKE', 'LOCALIZER', 'ANALYZER', 'RISK', 'PATCHER', 'CRITIC', 'VALIDATOR', 'DEPLOYER', 'VERIFIER'];

async function seedSteps(issueId, upto, failed = false) {
  for (let i = 0; i < STEPS.length; i++) {
    if (i > upto) break;
    const status = failed && i === upto ? 'failed' : 'ok';
    await insertGetId('pipeline_steps', {
      issue_id: issueId, stage: STEPS[i], status,
      detail: failed && i === upto ? 'Stopped here' : 'Completed',
      data: '{}', created_at: nowIso(),
    });
  }
}

export async function seedDemoData() {
  const existing = await get('SELECT id FROM websites LIMIT 1');
  if (existing) return { seeded: false };

  const owner = await get('SELECT id FROM users ORDER BY id LIMIT 1');
  const siteId = await insertGetId('websites', {
    name: 'Amazin Demo Shop', slug: 'amazin',
    repo_full_name: 'tejaswinibm2004/demo1',
    branch: 'main',
    live_url: 'https://shop-re-test.onrender.com',
    version_json_url: 'https://shop-re-test.onrender.com/version.json',
    health_urls: JSON.stringify(['https://shop-re-test.onrender.com']),
    allowed_origins: JSON.stringify(['https://shop-re-test.onrender.com', 'http://localhost:5173']),
    always_approve: 0, auto_deploy: 1, created_by: owner?.id || null,
  });

  const demoKey = `bs_demo_${crypto.randomBytes(6).toString('hex')}`;
  await insertGetId('ingestion_keys', { website_id: siteId, key_hash: sha256(demoKey), label: 'Local demo widget key', created_at: nowIso() });
  console.log(`[seed] local demo ingestion key (shown once): ${demoKey}`);

  const putSetting = async (key, value) => {
    const sql = dialect === 'postgres'
      ? `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING`
      : `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`;
    await query(sql, [key, value]);
  };
  await putSetting('autoDeploy', 'true');
  await putSetting('riskThreshold', '70');
  await putSetting('org', 'BugShield / BCS786 Team 40');

  const issue = async (o) => insertGetId('issues', {
    issue_key: o.key ?? `ISSUE-${crypto.randomBytes(4).toString('hex')}`,
    website_id: siteId, title: o.title, description: o.description || '',
    page_path: o.page || '/', status: o.status, risk_score: o.risk ?? 30,
    risk_band: o.band ?? 'LOW', defect_type: o.type || 'typo_copy',
    fingerprint: crypto.randomBytes(8).toString('hex'), occurrences: o.occ || 1,
    reporter: o.reporter || 'visitor', payload: JSON.stringify(o.payload || {}),
    analyzer_json: JSON.stringify(o.analyzer || {}), localizer_json: '{}',
    proposed_files: JSON.stringify(o.files || []), summary: o.summary || o.title,
    approver: o.approver || '', admin_note: o.note || '',
    created_at: o.created || nowIso(), updated_at: o.created || nowIso(),
    resolved_at: o.status === 'RESOLVED_AND_DEPLOYED' ? nowIso() : null,
    deploy_sha: o.sha || '',
  });

  const t = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();

  const i1 = await issue({
    key: 'ISSUE-8cc7ba4e', title: 'Header says "Shoping Cart" instead of "Shopping Cart"',
    description: 'The cart heading in the navbar has a spelling error: "Shoping Cart". Please fix.',
    page: '/', status: 'RESOLVED_AND_DEPLOYED', risk: 59, band: 'MEDIUM', type: 'typo_copy',
    files: ['index.html'], summary: 'Correct cart heading spelling', approver: 'bot',
    sha: 'fd09bae216d', reporter: 'visitor@demo', created: t(180),
    analyzer: { is_defect: true, confidence: 0.93, defect_type: 'typo_copy', impact: 'Visible copy error' },
  });
  await seedSteps(i1, 8);
  await insertGetId('patches', { issue_id: i1, files_json: '[{"path":"index.html","search":"Shoping Cart","replace":"Shopping Cart"}]', unified_diff: '--- a/index.html\n+++ b/index.html\n@@ -1,1 +1,1 @@\n-<span>Shoping Cart</span>\n+<span>Shopping Cart</span>', summary: 'Correct cart heading spelling', created_at: nowIso() });
  await insertGetId('validation_runs', { issue_id: i1, results_json: '[{"path":"index.html","status":"ok","detail":"basic HTML structure passed"}]', clean: 1, created_at: nowIso() });
  await insertGetId('approvals', { issue_id: i1, decision: 'approve', approver: 'bot', reason: 'non-critical auto-deploy', created_at: nowIso() });
  await insertGetId('deployments', { issue_id: i1, website_id: siteId, sha: 'fd09bae216d', status: 'VERIFIED', commit_url: 'https://github.com/YOUR_GITHUB_USER/shop-re-test/commit/fd09bae216d', checked_sha: 'fd09bae216d', verified_at: nowIso(), created_at: nowIso() });

  const i2 = await issue({
    key: 'ISSUE-a61f3c86', title: 'Probe: report with no code evidence',
    description: 'Everything is broken but no specific details are provided at all.',
    status: 'INVALID_REPORT', risk: 25, band: 'LOW', type: 'other',
    note: 'Insufficient evidence that this is a real code defect.', created: t(140),
    analyzer: { is_defect: false, confidence: 0.2, defect_type: 'other' },
  });
  await seedSteps(i2, 2, true);

  const i3 = await issue({
    key: 'ISSUE-3f91aa20', title: 'Checkout total shows wrong currency symbol',
    description: 'The price on the checkout page shows the wrong currency symbol near the total.',
    page: '/checkout', status: 'AWAITING_APPROVAL', risk: 78, band: 'CRITICAL', type: 'money_checkout',
    files: ['app.js', 'index.html'], summary: 'Fix currency symbol in checkout total',
    note: 'Money identifiers in diff — human gate required.', created: t(32),
    analyzer: { is_defect: true, confidence: 0.89, defect_type: 'money_checkout', impact: 'Incorrect price display' },
  });
  await seedSteps(i3, 6);

  const i4 = await issue({
    key: 'ISSUE-7b0c19de', title: 'Product image broken on category page',
    description: 'One product thumbnail is not loading on the category listing.',
    page: '/category', status: 'RECEIVED', risk: 30, band: 'LOW', type: 'broken_asset',
    created: t(6), files: ['index.html'],
  });
  await seedSteps(i4, 0);

  const i5 = await issue({
    key: 'ISSUE-91cd4a77', title: 'Cart badge does not update after add',
    description: 'Adding to cart does not refresh the badge count.',
    page: '/', status: 'DEPLOY_TIMEOUT', risk: 45, band: 'MEDIUM', type: 'logic',
    note: 'Deploy marker not observed in time; UNVERIFIED', created: t(95),
  });
  await seedSteps(i5, 7, true);

  const i6 = await issue({
    key: 'ISSUE-52ea8810', title: 'Footer link points to old domain',
    description: 'Footer link still uses the old domain.',
    status: 'ROLLED_BACK', risk: 38, band: 'LOW', type: 'config',
    note: 'Post-deploy health check failed; reverted.', created: t(260),
  });
  await seedSteps(i6, 8, true);
  await insertGetId('deployments', { issue_id: i6, website_id: siteId, sha: 'fa4becc', status: 'ROLLED_BACK', checked_sha: 'fa4becc', reverted_by: '50e0af43', created_at: nowIso() });

  for (const a of [
    ['bot', 'commit_pushed', 'ISSUE-8cc7ba4e', { sha: 'fd09bae216d' }],
    ['bot', 'resolved', 'ISSUE-8cc7ba4e', { sha: 'fd09bae216d' }],
    ['system', 'approval_requested', 'ISSUE-3f91aa20', { reasons: ['money/checkout identifiers in diff'] }],
    ['system', 'auto_revert', 'ISSUE-52ea8810', {}],
  ]) {
    await insertGetId('audit_log', { actor: a[0], action: a[1], target: a[2], detail: JSON.stringify(a[3]), created_at: nowIso() });
  }

  return { seeded: true, websiteId: siteId, demoKey };
}

// Extra demo sites are added idempotently so existing local databases pick them up on boot.
const EXTRA_SITES = [
  {
    name: 'AccountLab', slug: 'account-lab', repo: 'tejaswinibm2004/demo2',
    issues: [
      { key: 'ISSUE-login-any-password', title: 'Login accepts any password and reports success on failure', description: 'Sign in accepts any non-empty password. A failed login also shows "Welcome! You are now signed in."', page: '/login', status: 'AWAITING_APPROVAL', risk: 82, band: 'CRITICAL', type: 'security', note: 'Auth/login path — human gate required.', steps: 6, analyzer: { is_defect: true, confidence: 0.95, defect_type: 'security' } },
      { key: 'ISSUE-login-visible-password', title: 'Password field exposes the typed password', description: 'The password input renders as type="text" so the password is visible on screen.', page: '/login', status: 'RECEIVED', risk: 66, band: 'MEDIUM', type: 'security', steps: 0 },
    ],
  },
  {
    name: 'CountingLab', slug: 'counting-lab', repo: 'tejaswinibm2004/demo3',
    issues: [
      { key: 'ISSUE-count-off-by-one', title: 'Order count shows 16 when there are 7 orders', description: 'countOrders starts at 1 and loops with <=, so every KPI is inflated.', page: '/', status: 'RECEIVED', risk: 30, band: 'LOW', type: 'logic', steps: 0 },
      { key: 'ISSUE-pagination-last-page', title: 'Pagination hides the last page of orders', description: 'Total pages uses Math.floor instead of Math.ceil, so the final partial page is unreachable.', page: '/orders', status: 'TRIAGING', risk: 35, band: 'LOW', type: 'logic', steps: 2 },
    ],
  },
  {
    name: 'CartLab', slug: 'cart-lab', repo: 'tejaswinibm2004/demo4',
    issues: [
      { key: 'ISSUE-cart-quantity-string', title: 'Adding the same item twice makes quantity 11', description: 'The quantity uses string concatenation, so a second click turns 1 into 11 and breaks the total.', page: '/', status: 'AWAITING_APPROVAL', risk: 76, band: 'CRITICAL', type: 'money_checkout', note: 'Money identifiers in diff — human gate required.', steps: 6, analyzer: { is_defect: true, confidence: 0.92, defect_type: 'money_checkout' } },
      { key: 'ISSUE-cart-euro-symbol', title: 'Checkout total is charged in euros', description: 'The confirmation shows a euro symbol on a dollar store.', page: '/checkout', status: 'RECEIVED', risk: 48, band: 'MEDIUM', type: 'money_checkout', steps: 0 },
    ],
  },
];

export async function ensureDemoSites() {
  const owner = await get('SELECT id FROM users ORDER BY id LIMIT 1');
  const added = [];
  for (const s of EXTRA_SITES) {
    const exists = await get('SELECT id FROM websites WHERE slug = ?', [s.slug]);
    if (exists) continue;
    const siteId = await insertGetId('websites', {
      name: s.name, slug: s.slug, repo_full_name: s.repo, branch: 'main',
      live_url: `https://${s.slug}.onrender.com`,
      version_json_url: `https://${s.slug}.onrender.com/version.json`,
      health_urls: JSON.stringify([`https://${s.slug}.onrender.com`]),
      allowed_origins: JSON.stringify([`https://${s.slug}.onrender.com`, 'http://localhost:5173']),
      always_approve: 0, auto_deploy: 1, created_by: owner?.id || null,
    });
    const key = `bs_demo_${crypto.randomBytes(6).toString('hex')}`;
    await insertGetId('ingestion_keys', { website_id: siteId, key_hash: sha256(key), label: `${s.name} demo key`, created_at: nowIso() });
    console.log(`[seed] ${s.slug} ingestion key (shown once): ${key}`);

    for (const o of s.issues) {
      const id = await insertGetId('issues', {
        issue_key: o.key, website_id: siteId, title: o.title, description: o.description || '',
        page_path: o.page || '/', status: o.status, risk_score: o.risk, risk_band: o.band,
        defect_type: o.type, fingerprint: crypto.randomBytes(8).toString('hex'), occurrences: 1,
        reporter: 'demo-visitor', payload: '{}', analyzer_json: JSON.stringify(o.analyzer || {}),
        localizer_json: '{}', proposed_files: '[]', summary: o.title, admin_note: o.note || '',
        created_at: nowIso(), updated_at: nowIso(),
      });
      await seedSteps(id, o.steps ?? 0);
      if (o.status === 'AWAITING_APPROVAL') {
        await insertGetId('audit_log', { actor: 'system', action: 'approval_requested', target: o.key, detail: JSON.stringify({ reasons: [o.note] }), created_at: nowIso() });
      }
    }
    added.push(s.slug);
  }
  return added;
}
