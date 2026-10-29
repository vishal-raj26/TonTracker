# TonTrack P0 hardening implementation plan

**Goal:** Preserve current work and correct the five handover risks without changing valuation economics or resuming/deploying paid services.

**Architecture:** Keep the active vanilla/Node/Cloudflare stack. Use explicit static asset policy, HTML-derived edge packaging, fail-closed preview boundaries, and bounded indexed maintenance with durable progress. Preserve exact identity, event-time FX, authoritative inventory semantics and existing dirty work.

**Spec:** User's five P0 findings and request “fix everything”; `docs/handover-2026-10-29/PROJECT_HANDOVER_2026-10-29.md`; `AGENTS.md`; `docs/D1_ROW_READ_CHECKPOINT.md`.

**Tech:** Node built-in tests, existing JS/MJS/SQLite/D1, no new dependencies.

## Constraints and rulings

- Only this active checkout. No reset/clean/mass staging, new checkout, production deploy, migration, billable resumption or billing change.
- Ruling: user explicitly requested implementation; execute independent bounded tasks without another approval round. Use parallel agents for independent static and packaging domains per dispatching-parallel-agents; main owns preview/ignore/D1 and integration. Do not make commits of unrelated work by default.
- Ruling: locally preserve all eligible tracked/untracked work plus Git history before source edits. Credentials/runtime remain in original ignored locations, not the source checkpoint. Remote disaster recovery still requires an explicitly reviewed push/secure external backup; no claim it occurred.
- Do not unpause sales cleanup before measured local plans and eventual production acceptance. Preserve gift floor gate `listedCount <= 1`, symbol exclusion, model publication and sales evidence aggregates.

## Review focus

1. Encoded traversal, Windows separators/ADS, dotfiles, symlinks and method handling must not bypass public serving policy.
2. Every local HTML CSS/JS entry must exist in generated edge output; build must not copy runtime secrets or unchecked symlinks.
3. Production and non-loopback requests must reject fixture activation; preview caches must never leak into live totals.
4. Maintenance limits must bound rows examined, not only rows returned/deleted; resumable progress must not lose evidence/counters.
5. Baseline optimization must preserve full-corpus evidence/estimator behavior, not substitute an unlabelled recent sample to save reads.

## Tasks / execution ledger

- [x] Preservation: secure local directory `C:/Users/vishu/.codex/backups/tontrack/p0-20261029-3c5cff12`; 4,254 files hash-verified; history.bundle verified; tracked binary patch repaired/verified after initial shell argument failure. No credential/session/runtime contents exported.
- [x] Static serving: tests reproduce unsafe file access with synthetic fixtures; allow only published frontend entries/media; reject traversal/dotfiles/symlinks/unapproved files. Agent owns server/static policy tests.
- [x] Edge packaging: failing integration tests for loaded style omissions; derive local entries safely, validate paths/symlinks and actual build output. Agent owns build script/tests.
- [x] Preservation prevention: ignore all `.env.*` except examples, Telegram sessions and runtime directories; behavior-test Git ignore policy. Keep unrelated files unstaged.
- [x] Fixture boundary: production/runtime opt-in and request-boundary regression tests; fix identity/loopback/cache isolation failures if reproduced.
- [x] D1: replace full-table cleanup/count scans with bounded indexed resumable work; preserve evidence. Investigate full baseline aggregation and implement an unchanged-corpus cache/rebuild boundary if safe. SQL EXPLAIN/behavioral tests before completion; production quota acceptance remains undeployed.
- [x] Integration: locally verify actual edits, full suite, build outputs, Node syntax, graph update and final focused review; update handover/checkpoints with exact remaining production steps.

## Verification commands

Local integration completed:492/492 tests, build, both Worker dry runs, syntax, scoped whitespace and graph update passed. D1 remains **production-incomplete**: explicit migrations/bootstrap, exact-projection cadence and measured account-wide read-budget acceptance are required. Existing full-ledger CLI default is preserved; only explicit `--prepared` and the existing edge aggregate caller use staged aggregates. Local task checkboxes do not imply deployment or quota recovery.

Focused tests as added per task; `npm test`; `npm run build:edge`; syntax checks for modified JS/MJS; SQLite query-plan/row-budget checks; `git diff --check`. Runtime serving checks use synthetic sensitive files, never actual `.env` or sessions. Existing local server must be stopped/restarted only under active workspace rules if a real server smoke is needed.
