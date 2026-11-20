# Runbook

## Local

```bash
npm install
npm start                 # http://localhost:10000
npm test                  # 32 tests
npm run eval              # regenerate public/benchmark/results.json
```

SQLite database lives at `data/bugshield.db` (WAL). Delete the `data/` directory to reseed.

## Production

- `NODE_ENV=production` requires `DATABASE_URL` and a 32+ char `SESSION_SECRET`; startup fails fast otherwise.
- Migrations run automatically on boot (`src/db/migrations.js`), safe to re-run.
- Health check path: `/api/health`.
- Render free web service sleeps; first request after idle is a cold start.
- Supabase free Postgres pauses after ~7 idle days; the first connection may take longer.

## Connect a client site

1. Dashboard → **Websites → Connect website** (3-step wizard: Basics, Connection, Review).
2. Fill repo `owner/name`, branch, live URL, `version.json` URL, allowed origins.
3. **New key** — copy it once; set it as the client's `BUGSHIELD_KEY` env var.
4. Client build writes `config.js` (endpoint + key) and `version.json` with `RENDER_GIT_COMMIT`.
5. **Test repo** in the website card confirms Git Trees access.

## Verify a fix end-to-end

1. Open the demo shop, click the 🐞 widget, report the "Shoping Cart" typo.
2. Dashboard shows `RECEIVED → … → RESOLVED_AND_DEPLOYED` with 9 green stepper nodes.
3. Open **Issue detail → Deployment**: commit SHA matches `version.json` on the shop.
4. Health probes (3) pass; audit log records `commit_pushed` and `resolved`.

## Rollback

- **Issue detail → Revert** pushes a true revert commit (tree = target's parent, parent = current head) and marks the deployment `ROLLED_BACK`.
- Automatic revert happens when post-deploy health checks fail.
- If the verification marker never appears within the poll window, the issue ends `DEPLOY_TIMEOUT` / `UNVERIFIED` — never "deployed".

## Common states

| State | Meaning |
|-------|---------|
| `AI_UNAVAILABLE` | No AI key or provider error; no model verdict was fabricated |
| `NOT_PERFORMED` | Validator runtime missing on host; never shown as green |
| `SOURCE_UNAVAILABLE` | Repo map or file read failed |
| `AWAITING_APPROVAL` | Human gate hit (risk, sensitive path, money, site policy, safety, critic, validation) |
| `DEPLOY_TIMEOUT` | `version.json` never reported the pushed SHA |

## Data safety

- Report text is untrusted. Safety gates are enforced in code, not prompts.
- Secrets are redacted before storage; ingestion keys are hashed and displayed once.
- Nightly backups are expected on the SQLite path (production Postgres should use provider backups).
