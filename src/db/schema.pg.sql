CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reviewer',
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS websites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  repo_full_name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  live_url TEXT NOT NULL DEFAULT '',
  version_json_url TEXT NOT NULL DEFAULT '',
  health_urls TEXT NOT NULL DEFAULT '[]',
  allowed_origins TEXT NOT NULL DEFAULT '[]',
  always_approve INTEGER NOT NULL DEFAULT 0,
  auto_deploy INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS ingestion_keys (
  id SERIAL PRIMARY KEY,
  website_id INTEGER NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT now()::text,
  last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS issues (
  id SERIAL PRIMARY KEY,
  issue_key TEXT UNIQUE NOT NULL,
  website_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  page_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_band TEXT NOT NULL DEFAULT 'LOW',
  defect_type TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL DEFAULT '',
  occurrences INTEGER NOT NULL DEFAULT 1,
  reporter TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  analyzer_json TEXT NOT NULL DEFAULT '{}',
  localizer_json TEXT NOT NULL DEFAULT '{}',
  proposed_files TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  approver TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT now()::text,
  updated_at TEXT NOT NULL DEFAULT now()::text,
  resolved_at TEXT,
  deploy_sha TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS issue_cases (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_steps (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  detail TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS patches (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL,
  files_json TEXT NOT NULL DEFAULT '[]',
  unified_diff TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  critic TEXT NOT NULL DEFAULT '{}',
  safety TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS validation_runs (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL,
  results_json TEXT NOT NULL DEFAULT '[]',
  clean INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  approver TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL,
  website_id INTEGER NOT NULL,
  sha TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PUSHING',
  commit_url TEXT NOT NULL DEFAULT '',
  checked_sha TEXT NOT NULL DEFAULT '',
  verified_at TEXT,
  reverted_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'pipeline',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at BIGINT NOT NULL DEFAULT 0,
  locked_at BIGINT,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT now()::text
);
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT now()::text
);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_website ON issues(website_id);
CREATE INDEX IF NOT EXISTS idx_steps_issue ON pipeline_steps(issue_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
