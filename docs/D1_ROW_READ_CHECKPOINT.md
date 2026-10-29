# D1 daily row-read exhaustion — 2026-10-02

Status: **incomplete — hot queues improved, remaining maintenance still exceeds quota; gift-sales scheduled cleanup temporarily paused**.

## Follow-up — 2026-10-29 (local changes, production incomplete)

- Source now replaces the identified broad maintenance/count/statistics scans with indexed bounded pages, durable counters/cursors and explicit bootstrap. Baseline preparation uses exact full-corpus quantiles through checkpointed phases; new inserts cannot continuously restart a generation. Prior results publish only when complete, with source freshness preserved. See [rollout instructions](D1_BOUNDED_MAINTENANCE_ROLLOUT.md), measured SQLite plans in `d1-bounded-sql-metrics.json`, and [integration checkpoint](P0_HARDENING_CHECKPOINT.md).
- Synthetic 10k/200k query measurements exposed and removed an equal-timestamp correlated scan: 459,200 VM instructions fell to 17,800 at both corpus sizes. This measures SQLite execution work, not Cloudflare billed rows or current account headroom.
- Registry Worker dry-run bundle passed. No production migration, bootstrap, deployment or cleanup resume occurred. Public registry health currently confirms `giftSalesCleanupPaused: true`.
- Read-only cached Wrangler `d1 info` failed with authentication error10000/missing D1 scope. Current account-wide usage, deployed schemas, query billing and live price recovery remain unverified. Refresh operator access before rollout.
- Keep `GIFT_SALES_CLEANUP_PAUSED=1`. Production acceptance still requires schema/corpus audit, explicit migration, budgeted bootstrap, cadence/freshness canaries and account-wide Insights comparison. At 2m username observations three exact passes exceed 5m source reads before overhead, so the maximum configured storage is not a feasible daily free-tier read budget.
- CLI exact-projection contract preserved; aggregate-only mode now requires `--prepared`. Lease expiry uses database time and has a regression test without takeover. Final integrated Node suite:492/492 passed. Existing full-ledger CLI remains expensive; bounded exact-projection/cadence is a production gate, not silently removed functionality. Use the P0 checkpoint for exact next steps. Do not resume from the October3 fix as if this local work does not exist.

## Latest checkpoint — 2026-10-03

2026-10-04 UI follow-up: user requested no visible mock-price wording. Local fixture labels now say `Reference` and `Floor history`; internal preview markers/headers and production/loopback guards remain explicit. Browser caches use the v3 local-preview namespace. The yellow global notice is removed. This is presentation-only, not restoration of verified production gift prices or resolution of D1 quota usage.

- Authenticated Cloudflare GraphQL account analytics from 00:00 UTC to approximately 18:15 UTC: 15,307,356 rows read, 24,547 written. Reads exceed the 5M free daily cap. The root fix is NOT complete.
- Remaining top queries: legacy gift-sales ranking/retention DELETE 8,375,310 reads (4 executions); identity baseline aggregation 2,332,048 (11); identity full counts 1,282,488 (4). The new market knowledge queue averaged 80 rows/query over the latest 12 hours versus ~67K before.
- User requested temporary scheduled gift-sales cleanup pause and local mock gift pricing for UI work. `wrangler.jsonc` now sets `GIFT_SALES_CLEANUP_PAUSED=1`; scheduled compact pruning and legacy/compact sales retention return before running. Identity maintenance, history retention, ingestion and request APIs remain enabled. Existing stored sales are not deleted by this pause.
- Registry deployed version `b69a98ef-d475-440c-bb22-a8c0a922759f`; live `/health` confirmed `giftSalesCleanupPaused: true`.
- `lib/gift-price-preview.js`, enabled only by `TONTRACK_GIFT_PRICE_PREVIEW=1` outside production/Railway/Cloudflare environments, supplies labelled mock gift floors, thin-listing estimates, model reference values, trait stats, sales and chart data through existing API shapes. Actual wallet holdings/artwork remain real. Preview API access is restricted to loopback. Response clones do not mutate server wallet caches or persist mocks into market evidence; browser wallet/detail/watchlist caches use a preview-only namespace.
- Active local server started using `node scripts/start-gift-price-preview.js` from the absolute active workspace. This stops any 5177 listener and launches `node server.js` with preview opt-in. GET `/` JS/CSS markers matched active `index.html`; mock API verified 48 chart points and 10 sales. Restart the preview with the same command in subsequent UI sessions. Start normally without the opt-in to return to live gift pricing.
- Browser verified real damx.ton holdings through Home → Assets → Gifts → Ice Creams collection → Citrus model → individual gift detail, with collection/model statistics, model estimate, floor chart and sales. USD/GRAM switching exposed a rate mismatch; fixture USD conversion was corrected to use the wallet TON rate, with a regression test and preview cache version bump.
- Focused preview/cleanup/storage/detail tests: 29/29 passed; JS syntax and Wrangler dry-run passed. No production mock pricing deployment or Railway changes.
- Resume cleanup only after replacing full-table cleanup with bounded indexed work, then remove/set the pause flag to `0` and deploy. Other identity aggregation/count costs remain unresolved; this temporary pause is NOT a claim that the entire account budget is fixed.

## Evidence (Cloudflare D1 Insights, 12-hour window before the fix)

- `tontrack-valuation-read-model`: the per-minute username market knowledge queue read 48,860,654 rows in 727 runs, and its wallet queue read 23,129,283 in 693 runs. DNS queue scans added 7,209,873 and 1,818,758 rows in 19 and 10 runs. Both queue statements scanned/sorted broad ledgers for a tiny result limit.
- `tontrack-gift-sales-2025` and `tontrack-gift-sales-2026-b`: hourly `COUNT(*)` on ~400,000 event rows read 4,780,548 and 4,800,000 rows respectively in 12 runs per shard. Orphan-combo full joins added 795,869 and 11,483,460 rows respectively.
- The valuation identity-sales count also read 971,768 rows in 226 calls. Hot identity ingest paths counted entire tables to maintain storage quotas.
- Gift floor/registry databases had negligible direct row reads in the sampled top queries. Pricing failed because the account-wide D1 free-tier read cap was exhausted, not because the gift floor lookup itself was expensive.

## Changes made

- `cloudflare/gift-registry-worker.mjs`: fast/full username and DNS knowledge queues now page 64 index-ordered sale and asset rows using durable, separate cursors. They preserve pending items beyond each response limit instead of dropping them. The broad `GROUP BY` and JSON-filtered full scans were removed from the per-minute path. Candidate order is now fair cursor traversal rather than global sale-price priority.
- Hot identity asset/sale/valuation ingests probe only incoming indexed keys and increment tracked counts for new keys. Full-table quota reconciliation remains in daily maintenance.
- Full compact gift-sales pruning and identity count reconciliation now run at 02:17 UTC rather than hourly. An idle compact-sales shard no longer pays for an orphan join; event deletion triggers cleanup, and the manual maintenance endpoint can still force a full orphan sweep.
- No plan change, schema migration, Railway worker restart, or financial-value fallback was made.

## Verification

- `node --test test/gift-registry-storage.test.js test/identity-ingestion-edge.test.js`: 17/17 passed, including a 70-asset cursor traversal test and an idle-shard no-orphan-scan test.
- `npm test`: 385/385 passed.
- `node --check cloudflare/gift-registry-worker.mjs` and `wrangler deploy --dry-run`: passed.
- SQLite `EXPLAIN QUERY PLAN` confirmed index searches for the sale page, joined asset lookup, asset page, and incoming-key asset lookup.
- `python -m graphify update .`: completed (SQL parser optional dependency still unavailable).
- Deployed `tontrack-gift-registry` version `849daf32-79ea-447a-bf2a-5553e105617f`; its `/health` returned HTTP 200.

## Mandatory post-reset check

The Cloudflare account had already exceeded the daily quota before deployment. After 00:00 UTC on 2026-10-03, inspect 1-hour and then 12-hour D1 Insights for `tontrack-valuation-read-model`, `tontrack-gift-sales-2025`, and `tontrack-gift-sales-2026-b`. Verify each new queue query averages a bounded number of rows, the old global `GROUP BY` queries stop appearing, and the daily account total trends below 5 million row reads. Check authenticated gift and identity read paths once D1 is available, and investigate any other account-wide D1 consumer if the limit still rises unexpectedly. Current Wrangler OAuth lacks D1 list permission (`wrangler d1 list --json` returned authentication error 10000), so refresh access if Insights is also unavailable. Do not call live pricing recovered until those checks pass.
