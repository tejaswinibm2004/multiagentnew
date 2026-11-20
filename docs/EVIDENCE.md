# Evidence (verified results)

## Tests

`npm test` — **32/32 green** (`node:test`), covering ingestion guards, CSRF, risk scoring, edit uniqueness, forbidden paths, safety scanner, validators including `NOT_PERFORMED`, mocked analyzer/patcher/critic helpers, verifier SHA extraction, localizer ranking and the GitHub header/auth regression.

## Benchmark

21 fixtures, **18/21 localized**: html 1/1, css 3/3, js 4/4, ts 1/1, py 3/3, php 1/1, config 1/1, broken-asset 1/1, go 1/1, ruby 1/1. jsx 0/1 offline (known gap). Injection fixture forced approval; negative fixtures correctly empty. See `public/benchmark/results.json`.

## Live proof

- **ISSUE-8cc7ba4e** — "Shoping Cart" typo went `RECEIVED → … → RESOLVED_AND_DEPLOYED`. Bot commit `fd09bae216d` (`fix(bugshield): auto fix [ISSUE-8cc7ba4e]`, risk 59, approver recorded). `version.json` on the shop reported that SHA; all 9 stepper nodes green.
- Three more bot fixes shipped live: `2ff24508`, `678dde34`, `50e0af43`.
- Probe issue **ISSUE-a61f3c86** honestly ended `INVALID_REPORT`.
- Revert tested: `fd09bae` reverted in `57bf924`; shop rebuilt buggy. Later typo fix `6ba66fd` reverted in `fa4becc` on request.
- Latest mission-control dashboard ship: `27833fb` (login black-screen fix + wizard modal fix).
- Total hosting cost **$0**. Median observed fix time **3m32s**.

## Dogfooded bugs (each fixed with a regression test)

1. Widget endpoint race — last-script-tag assumption → `src` match + `data-endpoint`.
2. `ghFetch` token/options swap — `Bearer [object Object]` → 404 on blob POST → central header builder + 2 tests.
3. Black login screen — `display:grid` beat `[hidden]` → one-line `!important` fix.
4. Empty wizard modal — `appendChild(undefined)` → guard.
5. Scope fight — critic rejected minimal diffs → SCOPE RULE added to prompts.

## Definition of done

Both sites live [DONE] · zero-click typo fix proven by SHA [DONE fd09bae] · money bug approval + live [DONE] · revert verified [DONE] · non-bug/injection never auto-deploy [DONE] · ≥5 languages benchmarked [DONE] · tests green + eval shown in UI [DONE] · no secrets anywhere [DONE] · docs written [DONE].

Manual steps for a fresh deploy: fine-grained PAT, Render env vars, connect repos.
