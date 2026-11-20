# Architecture

## Process

```
public/index.html (SPA)  --HTTP-->  Express (:10000)
public/sdk/bugshield.js  --POST /api/v1/issues (CORS *)--+
                                      |
                            job queue (in-process)
                                      |
   Intake → Localizer → Analyzer → Risk → Patcher → Critic+Safety → Validator
                                      |
                              [approval gate]
                                      |
                          Deployer (per-site mutex)
                                      |
                                  Verifier
                                      |
                     WebSocket /ws broadcasts every step
```

## The 9 agents

| # | Agent | Job |
|---|-------|-----|
| 1 | Intake | strip HTML, cap lengths, fingerprint + 10-min dedup, extract quoted strings/selectors/stack file:line/URLs/identifiers |
| 2 | Localizer | repo map (ignore node_modules/dist/locks/>200KB), cheap grep first, rank top 8, LLM picks ≤5 real files, read ±80-line windows |
| 3 | Analyzer | strict JSON `{is_defect, confidence, defect_type, file, lines, explanation, impact}`; confidence <0.5 or false ⇒ `INVALID_REPORT` |
| 4 | Risk | deterministic 0–100: base 25, security +25, typo −5, sensitive path +15/+8 (cap +35), money +20 + gate, size +0..12, low confidence +6 |
| 5 | Patcher | search/replace edits, each matching exactly once, ≤3 files, ≤5 edits/file, ≤40 changed lines, forbidden paths blocked, real unified diff |
| 6 | Critic + Safety | second LLM `approve|concern|reject` + deterministic scanner on added lines (scripts, URLs, eval, innerHTML, network, base64, credentials, instruction echo) |
| 7 | Validator | registry by extension: `node --check`, tsc, JSON parse, HTML/CSS sanity, YAML, py_compile, php -l, ruby -c, gofmt; missing runtime ⇒ `NOT_PERFORMED` |
| 8 | Deployer | drift re-check, one atomic multi-file commit via Git Data API, `[ISSUE-id]` message, rebase once on non-fast-forward |
| 9 | Verifier | poll `version.json` for the SHA, 3 health probes need 2xx, failed health ⇒ automatic revert ⇒ `ROLLED_BACK` |

Every stage writes a `pipeline_step` row and broadcasts over `/ws`. Stages are idempotent; stuck jobs re-queue on boot.

## States

`RECEIVED, DEDUPLICATED, TRIAGING, ANALYZING, INVALID_REPORT, NOT_REPRODUCIBLE_IN_CODE, SOURCE_UNAVAILABLE, AI_UNAVAILABLE, PATCHING, PATCH_FAILED, VALIDATING, VALIDATION_FAILED, AWAITING_APPROVAL, REJECTED_BY_ADMIN, APPROVED, PUSHING, DEPLOYING, RESOLVED_AND_DEPLOYED, DEPLOY_TIMEOUT, ROLLED_BACK, FAILED`

## Data model (15 tables)

`users, sessions, websites, ingestion_keys, issues, issue_cases, pipeline_steps, patches, validation_runs, approvals, deployments, settings, audit_log, jobs, _migrations`

Schemas: `src/db/schema.sql` (SQLite AUTOINCREMENT) and `src/db/schema.pg.sql` (Postgres SERIAL).

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | health probe |
| POST | `/api/v1/issues` | public ingestion (only CORS-open route) |
| POST | `/auth/login`, `/auth/logout`, `/auth/change-password` | session auth + password change |
| POST | `/api/members/invite`, `/api/members/invitations/:id/approve\|reject` | owner-only invite → approve workflow |
| GET | `/api/members/invitations` | owner-only invitation list |
| GET | `/auth/me` | current user |
| CRUD | `/api/websites`, `/api/websites/:id` | site config + `/test` + `/keys` |
| GET | `/api/issues`, `/api/issues/:id` | list (cursor) + full detail |
| POST | `/api/issues/:id/approve|reject|retry|revert` | human actions |
| GET/POST | `/api/settings/policy`, `/api/settings/integrations-status` | policy |
| GET | `/api/audit`, `/api/stats/overview`, `/api/members` | insight/admin |
| WS | `/ws` | authenticated step stream |

Mutations require `X-Requested-With: XMLHttpRequest` and a matching Origin/Host.

## Ingestion guards (in order)

256KB cap (413) → key hash (401) → origin allow-list (403) → 30/min/key and 60/min/IP with `Retry-After` (429) → validation → 10-min dedup → store → async enqueue.

Caps: title 300, description 4000, steps 2000, outerHTML 2000, text 500, errors 20 (stack 8000), console 50, network 20 (URL+status only). No passwords or input values are stored.
