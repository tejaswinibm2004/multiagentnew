import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRisk } from '../src/agents/risk.js';
import { validateEdits, applyEdits, FORBIDDEN } from '../src/agents/patcher.js';
import { unifiedDiff, changedLineCount } from '../src/util/diff.js';
import { scanDiff } from '../src/agents/safety.js';

test('risk: baseline score is 25', () => {
  const r = scoreRisk({ defectType: 'logic', file: 'app.js', confidence: 1 });
  assert.equal(r.score, 25);
  assert.equal(r.band, 'LOW');
});

test('risk: security defect adds 25', () => {
  const r = scoreRisk({ defectType: 'security', file: 'app.js', confidence: 1 });
  assert.equal(r.score, 50);
});

test('risk: typo/copy subtracts 5', () => {
  const r = scoreRisk({ defectType: 'typo_copy', file: 'index.html', confidence: 1 });
  assert.equal(r.score, 20);
});

test('risk: money identifiers force a human gate', () => {
  const r = scoreRisk({ defectType: 'money_checkout', file: 'checkout.js', confidence: 1, diff: '+  price = 10' });
  assert.ok(r.score >= 60);
  assert.equal(r.sensitive, true);
  assert.equal(r.money, true);
});

test('risk: sensitive path adds 15 (capped at 35 overall)', () => {
  const r = scoreRisk({ defectType: 'security', file: 'auth.js', confidence: 1 });
  assert.equal(r.score, 65);
  assert.equal(r.sensitive, true);
});

test('risk: low confidence adds 6', () => {
  const r = scoreRisk({ defectType: 'logic', file: 'app.js', confidence: 0.4 });
  assert.equal(r.score, 31);
});

test('patcher: edit must match exactly one location', () => {
  const files = { 'a.js': 'let x = 1;\nlet y = 2;\n' };
  assert.equal(validateEdits([{ file: 'a.js', search: 'let x = 1;', replace: 'let x = 2;' }], files).ok, true);
});

test('patcher: non-unique search is rejected', () => {
  const files = { 'a.js': 'dup\ndup\n' };
  const r = validateEdits([{ file: 'a.js', search: 'dup', replace: 'x' }], files);
  assert.equal(r.ok, false);
  assert.match(r.reason, /exactly once/);
});

test('patcher: forbidden paths are blocked', () => {
  assert.match(FORBIDDEN.source, /node_modules/);
  const files = { '.env': 'SECRET=1' };
  const r = validateEdits([{ file: '.env', search: 'SECRET=1', replace: 'x' }], files);
  assert.equal(r.ok, false);
  assert.match(r.reason, /forbidden/);
});

test('patcher: at most three files', () => {
  const files = { a: 'x', b: 'x', c: 'x', d: 'x' };
  const edits = ['a', 'b', 'c', 'd'].map((f) => ({ file: f, search: 'x', replace: 'y' }));
  assert.equal(validateEdits(edits, files).ok, false);
});

test('patcher: applyEdits changes only the targeted snippet', () => {
  const files = { 'index.html': '<h1>Shoping Cart</h1>' };
  const edits = [{ file: 'index.html', search: 'Shoping Cart', replace: 'Shopping Cart' }];
  const out = applyEdits(edits, files);
  assert.equal(out.files['index.html'], '<h1>Shopping Cart</h1>');
  assert.ok(out.diff.includes('+<h1>Shopping Cart</h1>'));
});

test('diff: changedLineCount counts added and removed lines', () => {
  const d = unifiedDiff([{ path: 'a', before: 'a\nb', after: 'a\nc' }]);
  assert.equal(changedLineCount(d), 2);
});

test('safety: eval on an added line is flagged', () => {
  const r = scanDiff('--- a/x\n+++ b/x\n@@ -1 +1 @@\n+eval(userInput)');
  assert.equal(r.hit, true);
  assert.ok(r.findings.some((f) => f.name === 'eval'));
});

test('safety: remote URL on an added line is flagged', () => {
  assert.equal(scanDiff('+fetch("https://evil.test")').hit, true);
});

test('safety: clean minimal diff passes', () => {
  const r = scanDiff('--- a/x\n+++ b/x\n@@ -1 +1 @@\n-<span>Shoping</span>\n+<span>Shopping</span>');
  assert.equal(r.hit, false);
});
