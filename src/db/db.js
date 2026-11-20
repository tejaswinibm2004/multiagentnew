import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

let sqlite = null;
let pool = null;
export const dialect = config.databaseUrl ? 'postgres' : 'sqlite';

function rewrite(sql) {
  if (dialect !== 'postgres') return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function normalize(row) {
  if (!row) return row;
  // pg returns lowercase column names already; keep a plain object.
  return { ...row };
}

export async function initDb() {
  if (dialect === 'postgres') {
    const { Pool } = await import('pg');
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 5,
      ssl: config.databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });
    await pool.query('SELECT 1');
    console.log('[db] postgres pool ready');
  } else {
    fs.mkdirSync(path.dirname(config.sqliteFile), { recursive: true });
    sqlite = new DatabaseSync(config.sqliteFile);
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    console.log('[db] sqlite ready:', config.sqliteFile);
  }
}

export async function query(sql, params = []) {
  if (dialect === 'postgres') {
    const r = await pool.query(rewrite(sql), params);
    return r.rows.map(normalize);
  }
  const stmt = sqlite.prepare(sql);
  const rows = stmt.all(...params);
  return rows.map(normalize);
}

export async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function all(sql, params = []) {
  return query(sql, params);
}

export async function exec(sql) {
  if (dialect === 'postgres') return pool.query(sql);
  return sqlite.exec(sql);
}

export async function insertGetId(table, fields) {
  const keys = Object.keys(fields);
  const vals = keys.map((k) => fields[k]);
  const cols = keys.join(', ');
  const holes = keys.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols}) VALUES (${holes}) RETURNING id`;
  const rows = await query(sql, vals);
  if (rows.length) return rows[0].id;
  // Fallback for engines without RETURNING support.
  const r = await get('SELECT last_insert_rowid() AS id');
  return r?.id ?? null;
}

export async function update(table, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const vals = keys.map((k) => fields[k]);
  await query(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...vals, id]);
}

export async function remove(table, id) {
  await query(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

export async function close() {
  if (pool) await pool.end();
  if (sqlite) sqlite.close();
}
