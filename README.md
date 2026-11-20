# BugShield

**Multi-Agent Driven Intelligent Bug Detection and Secure Deployment System**

CSE major project · BCS786 · Team No 40 · Sai Vidya Institute of Technology · VTU

A visitor reports a bug through a widget on a client website. BugShield reads the client's **actual source code**, decides whether the report is a real defect, writes a minimal fix, verifies it with real tools, commits it to the client's GitHub repo, and proves the fix is live by reading the commit SHA from `version.json`. Non-critical fixes ship with zero human clicks; critical fixes pause for approval.

---

## Quick start (local, no API keys needed)

```bash
node -v            # 24.x required (node:sqlite WAL)
npm install
npm start          # http://localhost:10000
```

- Seed owner: `admin@bugshield.local`
- Password: value of `BUGSHIELD_SEED_PASSWORD` (local default is in `.env.example`; set your own)
- The local seed prints a one-time demo ingestion key to the console and fills the login form.

Both UI and API run in one process. `npm test` runs 32 `node:test` tests. `npm run eval` regenerates the Evaluation view JSON.

### Workspace controls

- **Settings → Appearance**: dark / light / system theme, persisted before paint.
- **Settings → Change password**: verify current password, 12-char minimum, other sessions signed out.
- **Team (owner only)**: invite by email → pending invitation with no access → owner approves → account created and a one-time password is shown once. Non-owners cannot invite or approve (server-enforced).

### Extra demo websites

`npm run demo` starts a static server on **http://localhost:5173** with four client sites:

| Path | Site | Bug categories |
|------|------|----------------|
| `/shop` | Amazin Demo Shop | copy typo, cart, checkout |
| `/account-lab` | AccountLab | login / auth / session |
| `/counting-lab` | CountingLab | counting / aggregation / pagination |
| `/cart-lab` | CartLab | cart / money arithmetic |

All four are seeded into the dashboard's **Websites** view on first boot (and added idempotently to an existing local DB). Each has its own `render.yaml` and build script. Bug lists are in `demo-sites/README.md`. Replace `REPLACE_WITH_DEMO_KEY` in each site's `config.js` with the key printed in the dashboard console, or deploy with `BUGSHIELD_KEY` set.

---

## Deploy (Render free tier + Supabase free Postgres)

1. Create a Supabase project; copy its **pooled** connection string (port 6543).
2. Fork/push two repos: dashboard (`buildshield-re`) and client shop (`shop-re-test`).
3. In Render, create a **Blueprint** from `render.yaml` (web service + static site).
4. Set secrets in Render (never in the repo):
   - `DATABASE_URL` — Supabase pooled connection string
   - `SESSION_SECRET` — long random string (≥ 32 chars)
   - `AI_API_KEY` — Groq key (OpenAI-compatible endpoint `https://api.groq.com/openai/v1`)
   - `GITHUB_TOKEN` — fine-grained PAT with Contents read/write on the client repo
   - `BUGSHIELD_KEY` — ingestion key created in the dashboard (static-site env var)
5. Set `NODE_ENV=production` on the web service. It fails fast if the DB or secret is missing.
6. In the dashboard: **Websites → Connect website**, then **New key**; paste that key into the shop's `BUGSHIELD_KEY` env var; redeploy the shop.

The shop's build script writes `config.js` and `version.json` (with `RENDER_GIT_COMMIT`) on every deploy.

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short:

- **9 agents**: Intake → Localizer → Analyzer → Risk → Patcher → Critic+Safety → Validator → [approval gate] → Deployer → Verifier.
- **Dual DB**: `node:sqlite` WAL for dev/test, `pg` pool to Postgres in production (`?` placeholders rewritten to `$n`, `RETURNING` for IDs). 15 tables.
- **One process**: in-process job queue, per-site deploy mutex, WebSocket step broadcasts.
- **AI**: pluggable OpenAI-compatible provider. No key ⇒ first-class `AI_UNAVAILABLE` state, never fake success.
- **GitHub**: plain `fetch` to the Git Data API; one atomic multi-file commit per fix.
- **Frontend**: vanilla-JS SPA, dark graphite + iris violet theme, CDN Lucide icons, no build step.

## Principles

1. **Universal** — any language in a Git repo; the LLM is primary, deterministic rules are hints.
2. **Honest** — no invented code, no unrun checks; `AI_UNAVAILABLE` / `NOT_PERFORMED` / `UNVERIFIED` are real states.
3. **Safe by default** — report text is untrusted; safety gates are code, not prompts.
4. **Real deployment** — fixes ship as commits; the dashboard never writes to the client filesystem.
5. **Traceable** — every step, diff, validation, SHA and approval is stored; `[ISSUE-id]` in commit messages; one-click revert.
6. **Simple** — one repo, one process, minimal dependencies, $0 hosting.

## Docs

- [PLAN.md](PLAN.md) — build scope and milestones
- [DECISIONS.md](DECISIONS.md) — design decisions, limits, non-goals
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model, pipeline, API
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — operations, verification, rollback
- [docs/EVIDENCE.md](docs/EVIDENCE.md) — verified live proof and known gaps

No secrets are included in this repository. Use placeholders for all keys and tokens.
