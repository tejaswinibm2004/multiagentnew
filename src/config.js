import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';

const bool = (v, def = false) => {
  if (v == null || v === '') return def;
  return /^(1|true|yes|on)$/i.test(String(v));
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: Number(process.env.PORT || 10000),
  host: process.env.HOST || '0.0.0.0',

  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production'
    ? null
    : 'dev-only-session-secret-do-not-use-in-production'),
  sessionTtlMs: 12 * 60 * 60 * 1000,

  databaseUrl: process.env.DATABASE_URL || '',
  dataDir: path.resolve(process.env.BUGSHIELD_DATA_DIR || path.join(process.cwd(), 'data')),
  sqliteFile: path.join(process.env.BUGSHIELD_DATA_DIR || path.join(process.cwd(), 'data'), 'bugshield.db'),

  ai: {
    baseUrl: process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1',
    model: process.env.AI_MODEL || 'openai/gpt-oss-120b',
    apiKey: process.env.AI_API_KEY || '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 45000),
  },

  github: {
    token: process.env.GITHUB_TOKEN || '',
    api: process.env.GITHUB_API || 'https://api.github.com',
  },

  seed: {
    email: process.env.BUGSHIELD_SEED_EMAIL || 'admin@bugshield.local',
    password: process.env.BUGSHIELD_SEED_PASSWORD || 'BugShieldDemo2024!',
    name: process.env.BUGSHIELD_SEED_NAME || 'Bug Shield Admin',
  },

  renderGitCommit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
  autoDeployDefault: bool(process.env.AUTO_DEPLOY_DEFAULT, true),
};

// Fail fast: production must have a real database and a real secret.
if (config.isProd && !config.databaseUrl) {
  console.error('[FATAL] NODE_ENV=production requires DATABASE_URL (Supabase pooled connection).');
  process.exit(1);
}
if (config.isProd && (!config.secret || config.secret.length < 32)) {
  console.error('[FATAL] NODE_ENV=production requires SESSION_SECRET >= 32 chars.');
  process.exit(1);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
