import fs from 'node:fs';
import { exec, query, dialect, initDb, close } from './db.js';

export async function runMigrations() {
  await initDb();
  const file = dialect === 'postgres' ? 'schema.pg.sql' : 'schema.sql';
  const sql = fs.readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  // Split on semicolons at end of line. Our schema statements contain no ';' in literals.
  const statements = sql.split(/;\s*\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      await exec(stmt.endsWith(';') ? stmt : stmt + ';');
    } catch (e) {
      if (!/already exists|duplicate/i.test(String(e.message))) throw e;
    }
  }
  if (dialect === 'sqlite') {
    await exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  }
  const marker = dialect === 'postgres'
    ? `INSERT INTO _migrations (name) VALUES (?) ON CONFLICT DO NOTHING`
    : `INSERT OR IGNORE INTO _migrations (name) VALUES (?)`;
  await query(marker, ['001-initial']);
  return { applied: statements.length, dialect };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().then((r) => {
    console.log('[migrate] done', r);
    return close();
  }).catch((e) => { console.error(e); process.exit(1); });
}
