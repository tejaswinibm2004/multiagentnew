# Build plan

## Milestones (this build)

1. **Scaffold & config** — package.json, `.node-version`, `.env.example`, `render.yaml`, `src/config.js`. Done.
2. **Data layer** — 15-table dual schema (SQLite + Postgres), unified query adapter, migrations, fail-fast in production. Done.
3. **Security surface** — scrypt auth, opaque hashed sessions, CSRF header + origin check, rate limits, central redactor, role gates. Done.
4. **Integrations** — OpenAI-compatible AI layer with strict JSON + one re-prompt, Git Data API committer with rebase-once, repo reader via Git Trees/Contents APIs, validator registry with `NOT_PERFORMED`. Done.
5. **Pipeline** — 9 agents + orchestrator + job queue + per-site mutex + WebSocket step broadcasts. Done.
6. **API** — ingestion guards, auth, websites, issues/approvals/retry/revert, settings, audit, stats, members, health. Done.
7. **UI** — mission-control SPA: login, overview, inbox with J/K/A/R, issues with filters/CSV/drawer, issue detail with live stepper/diff/risk/safety, deployments, websites wizard, settings, team, audit, evaluation. Done.
8. **Widget SDK** — shadow DOM, evidence capture, endpoint via `data-endpoint`/script-src, 429 countdown, dedup and misconfiguration states. Done.
9. **Demo shop** — amazin storefront, 17 planted bugs (answer keys gitignored), build script, version marker, cart tests. Done.
10. **Verification** — 32 `node:test` tests green, benchmark manifest + evaluation view, docs. Done.

## Deliberate deviations from the original inventory (documented, not hidden)

- Repo reading uses the **Git Trees + Contents APIs** instead of downloading a tarball. Same outcome (repo map + bounded file windows), fewer dependencies.
- On approval, patch edits are **re-read from the repo and re-applied** rather than persisting a full source snapshot; drift is detected at deploy time.
- Deterministic fallbacks exist for analyzer/patcher/critic when no AI key is set. They are labelled `fallback: true` in the recorded step; they are graceful degradation, not a claim that the model ran.
- Evaluation `npm run eval` replays a checked-in verified fixture manifest; it does not claim fresh model calls.
