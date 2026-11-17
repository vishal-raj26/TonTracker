# TonTrack P0 hardening — 29 October 2026

Status: **local fixes implemented and integrated tests passing; not deployed; D1 production acceptance incomplete**.

## Scope / authority

User explicitly requested fixing all five handover P0 findings: preserve uncommitted work safely, harden public file serving, repair edge packaging, fix D1 read-heavy paths and isolate fixture/live prices. Only active checkout; no production deployment, migration, cleanup resumption or billing change. Keep `GIFT_SALES_CLEANUP_PAUSED=1`.

## Preservation already completed

- Private NTFS directory: `C:/Users/vishu/.codex/backups/tontrack/p0-20261029-3c5cff12` (user and SYSTEM access).
- 4,254 eligible tracked/untracked source/media/research paths copied and SHA-256 verified.
- `history.bundle` verified with Git; `tracked-worktree.patch` is 630,559 bytes. Initial patch native-argument invocation failed; it was explicitly rerun successfully with a resolved argument. Do not repeat the backup from scratch as if it failed.
- Secrets/sessions/runtime caches were excluded and remain untouched in original ignored locations. Git index remained unchanged; no mass staging/commit/push.
- `.gitignore` now covers `.env.*` (retains `.env.example`), `.dev.vars*` (retains example), Telegram session/login variants, `*.session`, `.wrangler/`, `.tmp/`.
- This is local preservation, not an off-device backup or claim that GitHub contains all current work.

## Implemented, focused verified

- `lib/static-policy.js`, `server.js`: explicit approved root frontend entries, public media/model metadata, exact vendor paths; reject source/docs/data/dotfiles, malformed/encoded paths, Windows separators/ADS and symlinks; safe GET/HEAD handling and nosniff. Bind unchanged for platform compatibility.
- `scripts/build-edge-static-assets.js`: derive local HTML references, validate against shared public policy, include both missing CSS files, reject private paths and symlinks, validate exact `.edge-static` target before replacement. Build output verified against sources.
- `lib/gift-price-preview.js`: normalized production/deployment/runtime rejection; strict loopback hostname + peer + origin/no-forwarded request boundary. Closes public-tunnel-through-loopback preview gap.
- `server.js` live serializer and `app.js` JSON/parser/wallet/detail/watchlist cache boundaries reject marked fixture prices. Local preview namespace remains usable. Existing wallet-isolation test harness loads the actual guard functions.
- `test/static-serving-security.test.js`, `edge-static-build.test.js`, `p0-safety-boundaries.test.js`: RED reproduced before fixes; combined focused run with existing preview/wallet-isolation tests: **35/35 passed**; actual edge build passed.
- Local server restarted hidden from the sole active absolute workspace, PID 9748 at checkpoint. Preview and long scan autorun explicitly off. `/` markers match `index.html`, app marker `p0-hardening-20261029-1`; health200, `/server.js` and `/lib/static-policy.js`403, both previously missing CSS files200. No actual secret URL was requested.

## D1 implementation and review

- `cloudflare/bounded-maintenance.mjs`, registry worker and three explicit schema files implement indexed bounded cleanup, counters/bootstrap, orphan traversal, retention and automatic statistics. Missing schema fails closed; partial counts remain unknown. Operator bootstrap has explicit request/page/budget ceilings and never deletes sales.
- `cloudflare/identity-baseline-preparation.mjs` replaces aggregate window scans with durable full-corpus exact quantile/count/training phases. Raw pages are bounded before watermark filtering; new inserts do not restart a generation, material frozen-row updates invalidate it, and no-op updates do not. Complete-only publication preserves prior results and source freshness; no duplicate full evidence corpus.
- Measured 18 emitted SQL statements on 10k/200k SQLite fixtures. A hidden timestamp-prefix scan fell from459,200 to17,800 VM instructions; final measured peak33,500. These are local execution metrics, not Cloudflare billed rows. See `docs/d1-bounded-sql-metrics.json`.
- Independent review found two issues: default CLI lost exact-name valuation writes, and publication compared leases against invocation-start time. Both corrected with regression tests: existing CLI default preserved, aggregate-only mode explicit `--prepared`; lease checks use database `unixepoch()` even without a replacement owner.
- Existing no-argument `identity-baselines` worker/CLI still rebuilds the full ledger and remains expensive. It is NOT quota-safe merely because aggregate preparation is bounded. Before enabling that production role, provide a bounded exact-projection producer or an explicitly measured affordable cadence. Edge aggregate refresh already opts in and preserves partial completion state. Do not silently switch modes and remove exact projections.
- Local rollout instructions: `docs/D1_BOUNDED_MAINTENANCE_ROLLOUT.md`. At2m Username observations, three exact passes exceed the5m free daily read cap before overhead; storage maxima do not prove cadence feasibility.

Current D1 access check: no PATH Wrangler and `npx --no-install` could not resolve an installed default. Existing cached Wrangler executable was used read-only for `d1 info`; Cloudflare rejected it with authentication error10000/missing D1scope. No new login scope was granted. Account-wide present quota, schemas and live row-read changes are unverified. User must refresh suitable Cloudflare access before live measurement/rollout.

## Fresh integration evidence

- Final `npm test`: **492 passed, zero failed/skipped/cancelled**, 73.2s, Node24.13.0. Package target Node22 has not been separately rerun. The earlier failing full run exposed two VM harnesses missing actual pricing guards and the old cleanup test expecting inline DELETE strings; harnesses now load real guards and assert bounded retention calls behind the pause.
- Review-correction focused suite:20/20 passed; wallet coverage35/35 passed. Actual edge build passed; all five loaded stylesheet outputs match source bytes. Syntax checks passed for app/server, new helpers, worker/caller, CLI and inventory generator.
- Registry and app Worker `wrangler deploy --dry-run` passed locally. No deployment occurred. Registry dry run confirms cleanup flag1. Current public `/health` also confirms cleanup remains paused.
- Independent static/build/preview review found no actionable issues. Independent D1 review findings corrected and verified locally; agent messages alone were not treated as completion.
- Generated handover inventory now evaluates approved HTML entries and actual output hashes rather than an obsolete literal-copy-string heuristic. Historical handover documents link to this superseding checkpoint.
- Scoped `git diff --check` passed (only existing CRLF normalization notices). Graphify AST update passed:6,895 nodes/12,227 edges/473 communities; optional SQL parser unavailable for25 SQL files. Graph outputs remain local and excluded from the source checkpoint.
- Logs: `.tmp/p0-final-test.log`, `.tmp/p0-review-corrections.log`, `.tmp/p0-registry-dry-run.log`, `.tmp/p0-app-dry-run.log`. Local log files are not committed.

## Remaining exact production steps

1. Refresh suitable Cloudflare operator authentication; audit actual database schemas, corpus sizes and account-wide D1 consumers/headroom. No credentials pasted into source/docs.
2. Back up databases and apply the correct three schema variants only to their mapped bindings, then deploy the compatible Worker. No migration or production deployment has occurred here.
3. Run explicitly budgeted counter bootstrap; canary bounded maintenance with cleanup paused, full baseline preparation and all consumers. Verify source freshness, exact-name producer/cadence, cold oversized combinations and legacy symbol-split storage parity.
4. Measure actual billed row reads and generation completion at1h/12h/daily across the whole account. Choose a feasible approved cadence/plan; never silently sample exact corpus distributions or claim quota recovery from synthetic tests.
5. Resume Gift sales cleanup only after all gates pass. Keep `GIFT_SALES_CLEANUP_PAUSED=1` until then. No live Gift price/account quota recovery is claimed.

## Off-device checkpoint

User approved a reviewed checkpoint branch push to existing `vishal-raj26/TonTracker`; no main merge. **Source checkpoint pushed and verified:** branch `codex/p0-hardening-checkpoint-20261029`, source commit `c7bea7f48ae4918d545acf37a242be5ef006fc4c`, confirmed by `git ls-remote`. A documentation-only follow-up records this receipt on the same branch.

- Separate-index checkpoint contains4,237 paths; active branch stays `codex/chart-platform-rebuild`, original HEAD stays `5d1562ae3d8692cb7409f18b3cb5f5e217817bca`, staging index hash unchanged. Existing dirty files remain intact. No main merge, deployment or PR was created.
- Candidate review excludes credentials/session/runtime/skill/graph directories and root `.codex-*` evaluation dumps; original local backup preserves eligible research/source artifacts. Pattern scans found no unresolved credential matches; the credential-URL match in `scripts/start-active-local.js` was verified as environment-variable interpolation. This is not credential rotation or an exhaustive security certification.
- GitHub accepted the push with large-file advisory warnings for existing research datasets57–87MB. These are retained preservation artifacts, not changes to application dependencies or production services.
- Final HTTP/document smoke: all8 versioned JS/CSS markers match active source; health200, private source403, both CSS200, TonConnect manifest200; no preview header. All10 generated source fingerprints match, all5 stylesheet outputs match, and checked handover links have zero broken local targets.

Plan: `docs/superpowers/plans/2026-10-29-p0-hardening.md`. Reviewer task is read-only. Other agents finished static/build edits; do not redo them or overwrite unrelated preexisting work.
