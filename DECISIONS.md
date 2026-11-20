# Decisions, limits and non-goals

## Decisions

- **Dual pg/SQLite backend** — SQLite `node:sqlite` WAL needs zero setup locally; production uses a `pg` pool to Supabase (pooled port 6543). `?` placeholders are rewritten to `$n`.
- **scrypt from stdlib** — N=16384, 12-char minimum, no password library.
- **Opaque sessions** — 256-bit random token sent only as a cookie; SHA-256 hash stored at rest; 12h TTL; HttpOnly + SameSite=Strict.
- **Plain `fetch` to GitHub** — no Octokit. Headers built in one function so the token can never be swapped with an options object.
- **Vanilla UI** — no framework, no build step; one process serves API and SPA.
- **No invite-link SMTP** — members are created directly by an admin/reviewer.
- **No screenshots / no headless-browser repro** — evidence says "not performed" rather than implying visual verification.
- **No project dependency installation during validation** — validators run host tools only; missing runtimes report `NOT_PERFORMED`.
- **Money-in-diff always needs a human** — disclosed false positive: `#cart` in a rewritten nav line triggered the gate. The gate is intentionally conservative; no override.
- **UI rebuilt on a branch and merged only after verification** — the 27833fb dashboard ship (login black-screen fix + wizard modal fix).

## Honest limits

- Single instance, in-process queue; jobs left `locked` after a crash are re-queued on boot.
- Deploy = commit + host rebuild (1–3 min), not zero-downtime.
- Fix quality follows the model; behavioral proof is only as good as the project's tests.
- Visual bugs are judged from code + element context, not screenshots.
- Some validators need host runtimes (`tsc`, `python3`, `php`, `ruby`, `gofmt`); they report `NOT_PERFORMED` when absent.
- Free tiers sleep/pause: Render cold starts, Supabase pauses after ~7 idle days, free models can flake.
- jsx localization is 0/1 offline (known gap).

## Non-goals

Multi-tenancy · GitLab/Bitbucket · CI triggering · canary deploys · SSO · billing · mobile apps · change-password endpoint · member/site delete · onboarding checklist · before/after preview · notifications · i18n.

## Secrets policy

No keys, tokens or passwords in source. Env vars only; the dashboard never returns stored key hashes in a usable form, created keys are shown once. Default local seed credentials are for development only.
