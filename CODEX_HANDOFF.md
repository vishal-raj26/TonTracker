# Codex Handoff: Identity Valuation Work

> **2026-09-06 continuation:** Read `docs/USERNAME_REBUILD_CHECKPOINT.md` first for the active Telegram username rebuild. Sections below are historical and can contain superseded deployment and valuation assumptions. The current rebuild has not deployed or resumed workers.

## Read This First

- Correct project: `C:\Users\vishu\Documents\New project\ton-portfolio-chart-platform`.
- Current branch: `codex/chart-platform-rebuild`.
- Do not confuse this with the older `ton-portfolio-ui` project. The user has repeatedly been shown the wrong local server/project in the past; always verify the working directory and service before starting a server or deploying.
- This document is a continuity record, not a request to deploy. Do not deploy Railway or Cloudflare merely because files are dirty.
- Never include credentials in commits, logs, handoffs, or chat. Use configured environment-variable names only.

## Current Goal

Finish a production-quality valuation system for **Telegram collectible usernames first** and **TON DNS second**. The app must detect wallet-held NFT identities and show a useful valuation quickly on first import, using prepared market knowledge and verified sales rather than waiting for per-wallet research.

The immediate engineering focus is improving the remaining **never-sold high-value / premium-tail Telegram Username estimator** without damaging broad accuracy for ordinary usernames. Fresh exact-sale handling, DNS safeguards, and the Cloudflare ingestion pipeline are now deployed.

## What The User Originally Asked For

The user asked for deep, evidence-led research and a realistic production architecture for Telegram Username valuation. It must:

- detect collectible username NFTs in a connected/imported TON wallet;
- estimate their current market value, including usernames with no direct sale;
- learn from historical Fragment sales, comparable names, structural scarcity, semantic/context signals, and current ecosystem relevance;
- be explainable, testable against real historical outcomes, continuously refreshable, and scalable;
- use the resulting username knowledge carefully to improve TON DNS estimates, without valuing DNS as if it were a Telegram Username;
- precompute expensive work so first wallet import reads prepared results quickly;
- avoid misleading users with invented or stale live prices.

The user also asked to reduce waiting states. A first import may take a short bounded period while background enrichment runs, but assets should normally get an indicative value immediately and improve later. `Processing` should be rare, not the normal outcome.

## Product Decisions And Non-Negotiable Constraints

### Valuation integrity

- Never invent, interpolate, or label guessed values as live market prices.
- Match assets by contract, NFT address, collection, or verified identity key; never by display name or symbol alone.
- Historical sales must be stored in USD using the GRAM/USD rate at the exact sale time. Do not use a current, static, or default conversion rate.
- Native unit shown in the app is **GRAM**, not TON.
- Keep a distinction between verified market evidence, modeled/indicative estimates, confidence, and portfolio eligibility.
- Low-confidence assets should still receive a useful modeled value when evidence supports it, but must not be presented as verified market truth. Current production policy excludes unsupported/low-confidence model values from portfolio totals.
- Use historical sales and comparable names before broad structural fallback. Do not claim a username/domain is worth a premium solely because an encyclopedia page exists.

### DNS-specific rules

- TON DNS is generally less valuable than the equivalent Telegram Username. Do not use a fixed multiplier/discount; use DNS sales and DNS-specific liquidity/evidence.
- A generic Wikipedia/entity title is not market proof. Entity classification can only use explicit `entityMarketVerified === true` knowledge.
- DNS estimator version is currently `dns-market-v7`.

### Existing gift rules that must not be changed

- The hard-coded gift estimation model applies only to assets with `listedCount <= 1`. This is permanent unless the user explicitly changes it.
- For gift price display/storage, ignore `symbol`; store and show pricing only through the backdrop level.
- Gifts and NFT stickers are different asset types.
- Layered gift media uses verified local registry assets: local Lottie model, local PNG symbol, stored backdrop palette/gradient. Do not construct guessed remote media URLs. Unregistered layered gifts keep their normal static image.
- Fetch one floor per unique collection/model and reuse it for matching holdings.

### Infrastructure and cost constraints

- D1 compact projections are the production source of truth for identity valuations.
- Do not write new valuation data to PostgreSQL. The Railway PostgreSQL instance is offline/full at about 4.996 GB and is rollback/reconciliation-only.
- Do not store raw payloads or repeated full snapshots in D1. Retain compact, deduplicated evidence and summaries.
- Avoid duplicate workers and unnecessary Railway deployments. The user is cost-sensitive and does not want deployment churn.
- Graphify was requested for future project graphing. A local `graphify-out/` folder exists, but Graphify is not established as an active production dependency. Do not claim that it is.

## Architecture At Handoff

### Production services

- Main Railway application API: `https://tontracker-production-01f4.up.railway.app`.
- Cloudflare gift registry worker: `tontrack-gift-registry.vishu-vishal264.workers.dev`.
- Cloudflare identity-ingestion worker: `tontrack-identity-ingestion.vishu-vishal264.workers.dev`.
- Cloudflare edge application: `tontrack-app-edge.vishu-vishal264.workers.dev`.

Relevant Railway services seen previously:

- `TonTracker`: main application API.
- `gallant-charisma`: gift-sales worker.
- `overflowing-enjoyment`: gift-floor worker.

There is intentionally no separate Railway username-market worker to keep alive. Username market ingestion is handled by the Cloudflare identity worker and registry/D1 path.

### Cloudflare scheduling

`wrangler-identity-ingestion.jsonc` now schedules:

- `*/5 * * * *`: identity market/DNS/baseline cycle.
- `* * * * *`: bounded semantic knowledge enrichment cycle.

Latest recorded deployments before this handoff:

- Identity worker: version `53f0913e-f73d-4236-89a6-080c8226d1b8` (username knowledge v4 deployed, retaining only safe v3 lexical fields during the migration).
- Registry worker: version `87d43af3-852c-4c8e-ae8e-e6384b0f8e47` (username knowledge v4 queue deployed).

Those were successfully deployed. Local files may now contain additional uncommitted work, so inspect before deploying again.

After the v4 rollout, an authenticated `POST /run/knowledge` production check returned HTTP 200 and wrote four fast plus one full username records, and one fast plus one full DNS record. Railway was deliberately not deployed in this pass: the app tree contains unrelated dirty work, and the local first-import runtime change must be reviewed/released as an app change separately.

### Data flow

1. Wallet import detects identity NFTs and sends aliases/assets to the registry.
2. Registry maintains compact `identity_assets`, `identity_aliases`, `identity_sales`, prepared baselines, and valuation records in D1.
3. The identity worker ingests market sales, prioritizes high-value discoveries, resolves chain evidence within bounded limits, refreshes baselines, and enriches semantic knowledge in small batches.
4. Runtime (`lib/username-runtime.js` and `lib/dns-runtime.js`) reads prepared D1 evidence/baselines and produces immediate estimates; it queues follow-up enrichment rather than doing unbounded research in the request path.
5. UI/API should render the result according to valuation status/confidence and never conflate an indicative estimate with a verified sale/floor.

Baseline refresh is resumable by asset kind. Username and DNS refresh in separate scheduled invocations; a running checkpoint older than 20 minutes is recovered automatically. This replaced the prior all-in-one refresh that could leave `identity-baseline-refresh-v1` stuck in `running` after a Worker timeout.

## Implemented Work

### Telegram Username estimator

- Current estimator engine version: `username-market-v16` in `lib/username-engine.js`.
- Current learned model version: `username-learned-ridge-v11` in `lib/username-learned-model.js`.
- `lib/username-runtime.js` reads prepared D1 records, re-scores stale cached valuations when the global baseline revision changes, and records the baseline revision in explanations.
- `lib/username-backtest.js` and `scripts/username-backtest.js` were extended with structural-cohort and premium-probability diagnostics.
- Semantic knowledge exists in `lib/username-knowledge.js`; it uses lexical/context sources (Datamuse, exact Wikipedia/Wikimedia pageviews) as explanatory features, not direct price truth. The current schema is `username-knowledge-v4`: fuzzy Wikipedia search results are deliberately rejected, so only exact titles/redirects can produce entity or attention features. During the v3-to-v4 migration, runtime/model/backtest consumers retain only v3's safe Datamuse lexical fields (dictionary, frequency, related terms) and explicitly discard its entity, attention, and ecosystem fields while the Worker refreshes it.
- `scripts/bootstrap-identity-knowledge.js` was created and run to preload semantic records. At the time of the audit it had written 2,690 records / 5,380 statements. Cache composition was approximately 703 v3, 1,512 v2, 475 v1.
- The minute worker enriches two username and two DNS assets sequentially per run to remain within public-source and Worker subrequest limits.
- `scripts/rebuild-username-ledger.js` now prioritizes the most valuable discovered sales for chain/identity resolution via `marketEvidenceOrder()` and `marketPriorityUsernames()` instead of processing only arbitrary chronological rows.
- New targeted test: `test/username-ledger-priority.test.js`.
- The knowledge pipeline is now two-tier and live: each minute it writes up to four fast lexical username records, one fast lexical DNS record, one full username record, and one full DNS record. Fast records use only Datamuse and immediately provide dictionary/frequency/related-term features; full records add the slower Wikipedia/pageview refinement.
- The scheduled Worker passes `maxAttempts: 1` to public knowledge sources. This is deliberate: unbounded retries previously exceeded the Cloudflare Worker subrequest limit and caused the entire enrichment cycle to fail.
- **Deployed to Railway:** the first-import username evidence path performs a fast lexical lookup for up to four newly imported usernames in parallel with its Fragment-history check. Successful compact knowledge is written with the wallet-priority identity asset before the D1 rescore; lookup failure never blocks history, valuation, or display.
- **Deployed to Railway:** `lib/username-runtime.js` schedules bounded first-import evidence work even when an immediate learned estimate was already returned. Previously, a successful immediate score cleared the only enrichment branch, so wallet-specific Fragment history and lexical evidence were skipped. The request returns first; one background task (maximum 12 assets, configurable with `USERNAME_FIRST_IMPORT_EVIDENCE_LIMIT`) persists evidence, re-scores those assets, and refreshes D1/cache for the next read. `test/username-runtime.test.js` covers this non-blocking refresh.
- **v16 exact-evidence correction:** a fresh completed sale for the exact username is now dominant over broad low-price structural comparables and is not blended a second time with the generic learned model. This changes only estimates with exact sale evidence; comparable-only/no-sale behavior is unchanged. A live D1 evidence check for `kisser` moved the modeled midpoint from USD `146.04` to USD `483.17` against a fresh USD `889.08` finalized market-reported sale, while retaining a wide range and low confidence for the single unconfirmed record.

### DNS estimator

- Current DNS estimator version is `dns-market-v7` in `lib/dns-engine.js`.
- `lib/dns-runtime.js` and `cloudflare/identity-ingestion-edge.mjs` classify DNS using stored knowledge and can make a second evidence request when semantic classification changes the comparable route.
- Generic public/entity matches no longer create a market-entity route. `entityMarketVerified === true` is required. This prevents the prior severe overvaluations such as `conviction.ton` and `alemai.ton` caused by generic entity routing.
- DNS semantic marker: `dns-semantic-route-v2`; knowledge schema: `dns-knowledge-v1`.
- `test/dns-runtime.test.js` includes safeguards for this behavior.
- DNS can now use semantic related-term similarity between verified comparable records, but this is secondary to direct market evidence.

### Registry safety and evidence quality

- `cloudflare/gift-registry-worker.mjs` was fixed so later market-reported rediscovery cannot downgrade an already chain-confirmed identity sale.
  - Existing `toncenter` source remains authoritative.
  - Reliability is preserved with `MAX`, not downgraded with `MIN`.
  - Existing verified quality flags remain intact.
- New regression test: `test/gift-registry-storage.test.js`, `market-reported username re-ingestion cannot downgrade chain-confirmed evidence`.
- Registry identity reads now join semantic data by normalized identity name where appropriate, and knowledge queueing prioritizes market evidence while alternating with wallet-imported assets.
- **Deployed:** `readIdentitySales()` joins `identity_assets.semantic_json` onto returned sale rows. `scripts/username-backtest.js` preserves that prepared knowledge instead of overwriting it with an incomplete local cache. This makes evaluation match the production baseline-training feature path and is covered by focused regression tests.

### Data observed during prior audit

- Username ledger audit: 11,966 historical sales, 11,875 names, oldest 2022-11-02, newest 2026-08-25, mean reliability about 0.98, approximately 11,370 chain-confirmed. A bounded subsequent cycle accepted roughly 501 more records; refresh exact counts before relying on these figures.
- 365-day structural examples:
  - short Latin 4-5: 1,827 sales, 100% premium (USD 100+)
  - pattern Latin 4-5: 1,090 sales, about 30% premium
  - word Latin 4-5: 454 sales, about 20.9% premium; premium mean about USD 1,367.64
  - alphanumeric Latin 4-5: 994 sales, about 17% premium
  - word Latin 6-8: 1,183 sales, about 12.5% premium
  - word Latin 9-12: 968 sales, about 8.9% premium
- Recent high value market-reported examples included `pwned`, `sharingan`, `x6zs`, `proto`, `opengateway`, `surname`, `beside`, `ghostgirl`, `proficient`, and `plots`. They exposed a premium-tail failure, not a timestamp ingestion issue.

## Model Evaluation And Findings

Canonical compact-ledger chronological test at the last stable point:

- 11,966 sales available; 500 evaluated.
- Overall median factor error: `1.3889`.
- Coverage: `0.608`.
- USD bands:
  - under USD 25: 409 samples, error `1.3199`, ratio `1.3190`, coverage `.724`.

Latest direct-sale-history check (current compact ledger, 12,820 sales / 1,000 chronological holdouts):

- Overall median factor error: `1.4138`; coverage `.564`.
- `981` holdouts had no earlier sale for the exact same username and median factor error `1.4081`.
- Only `18` had one earlier exact sale (median factor error `1.5256`) and only one had repeated history. This is far too little evidence to retune the estimator around direct-sale blending.
- USD 500+ remained the central gap: `25` samples, median factor error `38.5013`, median prediction ratio `.0260`.

Additional live D1 cohort check (recent 180 days):

- Latin `short|4-5` is the only sufficiently populated ultra-premium structural cohort: `128/688` sales were at least USD 10,000 (18.6%), with ultra-sale median USD `13,151` and p80 USD `15,459`.
- Every longer word/pattern cohort had at most five USD-10k sales, and the major word/pattern 6+ cohorts had zero. Do **not** create a global high-tail multiplier or a generic long-word premium tier from isolated expensive outcomes.
- Exceptional six-figure short-name outcomes remain too rare to infer for a never-sold name from structure alone. Exact completed sale recovery is the correct evidence path for those assets.
  - USD 25-100: 37 samples, error `1.9159`, ratio `.5219`, coverage `.108`.
  - USD 100-500: 37 samples, error `8.7749`, ratio `.1140`, coverage `0`.
  - USD 500+: 17 samples, error `20.141`, ratio `.04965`, coverage `.235`.

Interpretation: the model is materially useful for the ordinary liquid market, but underprices the expensive tail. Its premium branch can recognize premium likelihood, yet ordinary cohort/comparable medians still pull final estimates down.

## Approaches Tested Or Rejected

1. **Platt-like premium-probability calibration (`username-learned-ridge-v12`)**
   - This was an experimental model/calibration label only; it is unrelated to the shipped `username-market-v16` direct-evidence correction.
   - It did not improve the canonical evaluation: overall median factor error became about `1.3923` vs `1.3889`, while premium coverage did not improve.
   - Reverted. Keep learned model v11; do not reintroduce this global calibration.

2. **Raise learned premium blend multiplier from 1.5 to 2.5**
   - Improved the high bands in isolation (about `8.77 -> 7.94` for USD 100-500 and `20.14 -> 15.39` for USD 500+).
   - It hurt ordinary names and total behavior (overall error about `1.39 -> 1.47`).
   - Reverted. Do not ship a global multiplier.

3. **Probability-weighted premium median within structural/semantic cohorts**
   - Implemented locally as an experiment, then evaluated on the current 500-sale run.
   - It worsened overall median factor error to `1.7023`, raised the under-USD-25 error to `1.5648`, and did not improve the USD-500+ band (`37.0311`).
   - Removed from source. The artifact is `.codex-username-backtest-premium-cohort.json`.

4. **Use Wikipedia/entity recognition as direct valuation evidence**
   - Rejected. It caused DNS overvaluation and is not proof that an NFT identity has market demand.
   - It may remain a weak semantic/context feature only. DNS entity routing requires curated, explicit `entityMarketVerified` data.

5. **Per-wallet live crawling as the main estimator path**
   - Rejected for production UX/cost. It delays first import, repeats work, risks rate limits, and makes outcomes inconsistent. Use prepared D1 evidence and bounded background enrichment.

6. **New writes to Railway PostgreSQL / retaining raw snapshots**
   - Rejected because PostgreSQL is full/offline and the old design caused storage growth. D1 projections must stay compact/deduplicated.

7. **Displaying an unsupported fallback as market value**
   - Rejected. A broad baseline can be an explicit indicative estimate, but never described as verified/live market evidence and never silently included in totals under current eligibility policy.

## Partially Implemented / Not Yet Complete

### Premium-tail username work

- The premium-median candidate was tried and rejected; it is not present in `lib/username-learned-model.js`. Confirm with `rg -n "premiumMedianUsd" lib test` before assuming otherwise.
- The next backtest must use the corrected registry semantic-read route after the registry Worker is deployed. Earlier broad backtests mainly used an incomplete local cache, while the production baseline trainer already joins D1 semantic knowledge.
- Any candidate must run the chronological backtest and compare both global and USD-band results before it is retained. Do not optimize only expensive examples.

### Semantic coverage

- Preloading and periodic enrichment exist, but semantic coverage is still incomplete. The stored model must not rely on a network request at valuation time.
- Need to measure coverage and estimate quality separately for semantic-complete and semantic-incomplete assets.

### Market evidence quality

- The registry safety regression is fixed, but high-value market-reported sales need continued chain reconciliation where identity/settlement mapping is available.
- Do not downgrade chain-confirmed rows when a weaker source rediscovers them.

### First-import presentation

- Backend is designed to produce prepared values quickly, but app-level UX should still be audited to ensure it does not show permanent `Processing`/`Unavailable` where a current indicative result exists.
- Keep the distinction between displayed estimate and portfolio eligibility intact.

### Production completion gates

- Run focused tests after each model/worker edit, then the full suite before a deployment.
- Build the appropriate Worker before deploying it.
- Verify the correct local project and target service. Do not deploy Railway when only Cloudflare code changed.

## Relevant Files And Responsibilities

### Runtime and estimator code

- `lib/username-engine.js`: username estimator version and core market-estimation rules.
- `lib/username-estimator.js`: combines runtime evidence and learned model output.
- `lib/username-learned-model.js`: learned feature extraction, cohort data, model training/prediction; current v11.
- `lib/username-runtime.js`: wallet-import prepared-value read, cache re-score, valuation persistence/queue behavior.
- `lib/username-backtest.js`: chronological backtest and diagnostics.
- `lib/username-knowledge.js`: semantic knowledge enrichment and stored feature shape.
- `lib/dns-engine.js`: DNS market rules; v7.
- `lib/dns-runtime.js`: DNS first-import evidence fetch, semantic reclassification, D1 queue/write path.
- `lib/dns-structural.js`: DNS structural classification.

### Workers and data intake

- `cloudflare/identity-ingestion-edge.mjs`: scheduled username/DNS ingest, baseline refresh, bounded knowledge cycles.
- `cloudflare/gift-registry-worker.mjs`: D1 registry API; identity assets/aliases/sales ingestion, evidence reads, queueing, data-quality protections.
- `wrangler-identity-ingestion.jsonc`: identity Worker routes, D1 bindings, cron schedule.
- `scripts/rebuild-username-ledger.js`: Fragment/market username ledger ingest and priority ordering.
- `scripts/refresh-identity-baselines.js`: baseline snapshots and learned model refresh.
- `scripts/bootstrap-identity-knowledge.js`: preload semantic knowledge.
- `scripts/enrich-username-knowledge.js`: local/targeted enrichment helper.
- `scripts/username-backtest.js`: CLI output for backtest diagnostics.

### Documentation

- `docs/IDENTITY_VALUATION_INVARIANTS.md`: valuation safety policies.
- `docs/PRODUCTION_DATA_ARCHITECTURE.md`: untracked local architecture document; inspect before relying on it.
- `docs/USERNAME_MARKET_SOURCE_POLICY.md`: untracked local source-policy document; inspect before relying on it.
- `RAILWAY-DEPLOYMENT.md`: historical deployment architecture. It must be read critically because some worker responsibilities were moved to Cloudflare.
- `AGENTS.md`: repo-specific working rules. Follow it.

### Tests

- `test/username-estimator.test.js`
- `test/username-runtime.test.js`
- `test/username-backtest.test.js`
- `test/username-ledger-priority.test.js` (untracked)
- `test/bootstrap-identity-knowledge.test.js` (untracked)
- `test/dns-runtime.test.js`
- `test/gift-registry-storage.test.js`
- `test/identity-ingestion-edge.test.js`

## API Routes Worth Inspecting

Routes are implemented in `cloudflare/gift-registry-worker.mjs` and used by runtime/worker code. Confirm exact paths before changing callers:

- `POST /identity/username-evidence/read`
- `POST /identity/dns-evidence/read`
- `POST /identity/knowledge/queue`
- `POST /ingest/identity-assets`
- `POST /ingest/identity-aliases`
- `POST /ingest/identity-knowledge`
- identity sales/baseline ingestion/read routes used by `scripts/rebuild-username-ledger.js` and `scripts/refresh-identity-baselines.js`.

Manual Cloudflare Worker runs previously used endpoints such as `POST /run/username` and `POST /run/knowledge`; protect these with the configured secret and do not expose it.

## Git Working Tree Snapshot At Handoff

Captured on branch `codex/chart-platform-rebuild`.

Tracked modified files (25):

```text
.gitignore
AGENTS.md
DESIGN.md
RAILWAY-DEPLOYMENT.md
cloudflare/gift-registry-worker.mjs
cloudflare/identity-ingestion-edge.mjs
docs/IDENTITY_VALUATION_INVARIANTS.md
docs/chart-parity.json
lib/dns-engine.js
lib/dns-runtime.js
lib/username-backtest.js
lib/username-engine.js
lib/username-learned-model.js
lib/username-runtime.js
package.json
scripts/rebuild-username-ledger.js
scripts/snapshot-gift-combos.js
scripts/username-backtest.js
test/dns-runtime.test.js
test/gift-registry-storage.test.js
test/identity-ingestion-edge.test.js
test/username-backtest.test.js
test/username-estimator.test.js
test/username-runtime.test.js
wrangler-identity-ingestion.jsonc
```

Untracked files/directories include:

```text
.codex-username-backtest-*.json
.codex/
.wrangler/
docs/PRODUCTION_DATA_ARCHITECTURE.md
docs/USERNAME_MARKET_SOURCE_POLICY.md
graphify-out/
research/
scripts/bootstrap-identity-knowledge.js
scripts/enrich-username-knowledge.js
test/bootstrap-identity-knowledge.test.js
test/username-ledger-priority.test.js
```

The current tracked diff reported **702 insertions and 179 deletions across 25 files**. This is a dirty shared worktree. Treat all existing changes as potentially user-owned or previously generated work: do not reset, discard, reformat wholesale, or assume every changed file belongs to the current identity-estimator task.

Useful local backtest artifacts:

- `.codex-username-backtest-current.json`
- `.codex-username-backtest-after.json`
- `.codex-username-backtest-v16.json`
- `.codex-username-backtest-share-2_5.json`
- `.codex-username-backtest-premium-diagnostics.json`
- `.codex-username-backtest-premium-cohort.json` (rejected premium-median experiment)

They are experiment evidence, not production inputs. Keep them out of production deployment and decide later whether to retain them in git.

## Verification Already Performed

- `npm run build:edge` passed before the listed Cloudflare deployments.
- Focused registry storage test passed after the chain-confirmed evidence protection: 8/8.
- Focused identity-ingestion, username-ledger-priority, and Fragment-source tests passed: 14/14 at that point.
- Username estimator/backtest focused tests passed: 16/16 before the unsuccessful premium-tail patch attempt.
- After the semantic D1-read alignment, focused username estimator/runtime/backtest and registry tests passed: 38/38.
- After adding two-tier knowledge coverage, retry budgeting, and resumable baseline refresh, focused Worker/DNS/username suites passed: 47/47 and 36/36; targeted Worker retry/state tests also passed 17/17 and 7/7.
- The local first-import lexical-write change passed its focused evidence/runtime/estimator/knowledge suite: 28/28. It needs a deliberate Railway app release after review because the shared worktree contains unrelated local changes.
- After v4 compatibility and exact-sale background-refresh coverage, 51 focused registry/identity/username tests passed. A full `npm test` run later had gift-sales lock contention from an overlapping transient worker; its username/DNS/registry coverage had passed before that unrelated failure. Do not report a full-suite green result until rerun without that lock.
- Live verification completed: the registry is on `60b1607b-f3a1-48a2-b449-286350176827`; the identity worker is on `8dbcb12a-c4c0-4e02-ae1c-44787b0f1b99`. A protected knowledge cycle wrote 4 fast username, 1 full username, 1 fast DNS, and 1 full DNS record. The baseline state is `complete` with the counts stated in the exact next step.
- A prior full `npm test` passed 148/148, but do not claim this for the current final dirty state without rerunning it.
- Existing unrelated repository gates previously failed:
  - `npm run verify:chart-loc`: 838 where target is <= 756.
  - `npm run verify:source`: stale head hash.

These gates are not evidence that the identity changes are wrong, but they block a clean whole-repo green claim and need separate ownership/triage.

## Operational Commands And Setup

Run these from the correct project root:

```powershell
Set-Location "C:\Users\vishu\Documents\New project\ton-portfolio-chart-platform"
git branch --show-current
npm run dev:active             # preferred local launcher; confirms the active project
npm run dev                    # direct local server only when intentionally needed
npm test
npm run build:edge
npm run backtest:usernames
npm run backtest:dns
```

Useful focused test commands:

```powershell
node --test test/username-estimator.test.js test/username-runtime.test.js test/username-backtest.test.js
node --test test/username-ledger-priority.test.js test/identity-ingestion-edge.test.js
node --test test/dns-runtime.test.js test/gift-registry-storage.test.js
```

Do not launch a legacy project merely because port 5177 is already open. Check the terminal's current directory and use `npm run dev:active` when the goal is to serve this project.

The intended routine production jobs are now Cloudflare-based. The local scripts remain useful for focused/manual recovery, but do not run continuous variants casually:

```powershell
npm run valuation:username-ledger
npm run valuation:baselines
npm run bootstrap:username-knowledge
npm run calibrate:usernames:knowledge
```

Required names, never values:

- `D1_REGISTRY_URL` or `VALUATION_READ_MODEL_URL`: registry/read-model base URL.
- `D1_INGEST_SECRET`: registry write/read authorization used by runtimes and workers.
- `IDENTITY_TRIGGER_SECRET`: optional protected manual identity-worker trigger; falls back to `D1_INGEST_SECRET`.
- Worker tuning vars in `wrangler-identity-ingestion.jsonc`, including Fragment pacing, Toncenter verification batch size, DNS page/history limits, and baseline refresh interval.

Before a Worker deploy, inspect its configuration and deploy only the affected Worker. The identity worker is defined in `wrangler-identity-ingestion.jsonc`; the registry/app have their own Wrangler configuration files. Do not deploy Railway for a Cloudflare-only change.

## D1 Schemas, Migrations, And Live Verification

Identity valuation schema source:

- `cloudflare/valuation-read-model.sql`
- `cloudflare/valuation-read-model-migrations/0001_identity_asset_aliases.sql`
- `cloudflare/valuation-read-model-migrations/0002_valuation_read_model_bootstrap.sql`

Primary tables:

- `valuation_records`: prepared portfolio-facing valuation output.
- `valuation_projection_state`: compact projection state/versioning.
- `identity_assets`: canonical DNS/username feature and semantic records.
- `identity_asset_aliases`: wallet NFT address to canonical name mapping.
- `identity_sales`: deduplicated market/chain sale evidence, historical USD attribution, and quality metadata.
- `identity_current_market`: current market materialization where available.
- `identity_archetype_baselines`: prepared route/archetype baselines.
- `identity_pipeline_state`: durable cursors/checkpoints.
- `identity_storage_policy`: compact-storage limits/guardrails.

Gift schema/migrations are separate. Relevant sources are `cloudflare/schema.sql`, `cloudflare/gift-sales-compact-schema.sql`, `cloudflare/gift-floor-sources-schema.sql`, and `cloudflare/migrations/`. Do not mix identity ledger storage with gift sales/floor storage without an explicit migration plan.

Live verification checklist after a relevant deployment:

1. Verify the correct project, Git diff, and Worker config before deployment.
2. Run focused tests and `npm run build:edge` if edge/static assets are involved.
3. Confirm the Worker deployment version in Cloudflare, not only the CLI exit code.
4. Run one bounded protected identity cycle; inspect its result for accepted/processed records and cursor advancement.
5. Check D1 counts/state through the registry's protected stats/read endpoints or Cloudflare dashboard. Confirm no unexpected raw payload growth.
6. Test a wallet with known username/DNS NFTs. Verify canonical name/address matching, an immediate prepared response when data exists, correct USD/GRAM conversion provenance, and no false portfolio inclusion for unsupported values.
7. For a sale re-ingestion test, confirm an existing `toncenter`-confirmed row retains source, reliability, and quality flags.

Do not report a live verification unless the exact endpoint, worker version, and observed response have actually been checked.

## Untracked Files: Keep Versus Clean Up

Likely intentional work that needs review and eventual commit decision:

- `docs/PRODUCTION_DATA_ARCHITECTURE.md`
- `docs/USERNAME_MARKET_SOURCE_POLICY.md`
- `scripts/bootstrap-identity-knowledge.js`
- `scripts/enrich-username-knowledge.js`
- `test/bootstrap-identity-knowledge.test.js`
- `test/username-ledger-priority.test.js`
- `research/` only after confirming its sources/results are reproducible and do not contain secrets or scraped raw material that should not be committed.

Likely disposable/generated local output unless deliberately retained:

- `.codex-username-backtest-*.json`: experiment artifacts.
- `.wrangler/`: Wrangler local state/cache.
- most of `.codex/`: Codex local metadata/output; inspect before deletion.
- `graphify-out/`: generated graph output; retain only if it is a deliberate documented artifact.

Never bulk-delete untracked files solely to make `git status` clean. Inspect ownership/content first; this is a shared dirty worktree.

## Graphify Status

The user requested the Graphify project (`Graphify-Labs/graphify`) be used for project graphing going forward. At handoff:

- `graphify-out/` exists locally.
- Graphify is **not** a configured runtime dependency, production pipeline, or required deployment gate.
- No claim should be made that it reduces tokens, tracks live production state, or is active in the app without verifying its installation and output.

Use it only as a development/documentation aid unless a separate scoped task wires it in. A sensible next use is to regenerate an architecture/dependency graph after the estimator work stabilizes, then include the graph or a concise source-of-truth summary in documentation. Do not add it to the production request path.

## Known Bugs, Risks, And Blockers

1. **Username premium-tail underpricing remains the main product-quality gap.** The current estimator systematically misses rare high-demand auction names. Do not paper over it with a single multiplier.
2. **Semantic data is incomplete.** It is helpful for categorization/similarity but cannot replace verified sale data; network availability and source rate limits can delay enrichment. After the local v4 schema change is deployed, existing v3 rows will queue for refresh; do not treat their old entity/attention fields as valid in the interim.
3. **Source/chain coverage is imperfect.** Market-reported sales may be accurate but should be reconciled when possible. The current code prevents confirmed evidence from being weakened.
4. **Rate limits are real.** Historical workers previously saw CoinGecko and GiftSatellite 429s. Use pacing, cache compact data, retry boundedly, and avoid new fan-out behavior.
5. **PostgreSQL is not a fallback for production writes.** It is full/offline. Do not revive the old storage pipeline by accident.
6. **Wrong-server risk.** Codex/browser has repeatedly opened the older local project/server. Check `Get-Location`, the project root, `package.json`, and running process before `npm run dev` or deployment.
7. **No credentials belong in this document.** Environment variable names such as `D1_INGEST_SECRET` are safe to reference; values are not.
8. **Rotate production credentials.** A local Railway CLI audit was able to read production environment values. Do not record their values anywhere; rotate the affected Railway/Worker credentials in their respective dashboards before the next broad operational change.

## Latest Safe Production Release (2026-08-26)

- **Release commit:** `923c50fd64fe0b3d0d07990e056705346d3fc6f4` (`Improve username first-import valuations`).
- **Railway deployment:** `0a68871c-0d0a-401d-b9cf-7951b09ee6b6`, status `SUCCESS`.
- **Service:** `TonTracker` in Railway project `earnest-communication`, production environment. Public endpoint: `https://tontracker-production-01f4.up.railway.app`.
- **Verified response:** `GET /api/health` returned `ok: true`, `mode: app-server`, and revision `0a68871c-0d0a-401d-b9cf-7951b09ee6b6` after the release.
- **Release scope deliberately isolated:** clean worktree at `923c50f`, containing only `lib/username-engine.js`, `lib/username-estimator.js`, `lib/username-first-import-evidence.js`, `lib/username-knowledge.js`, `lib/username-learned-model.js`, `lib/username-runtime.js`, and their focused tests. The broad dirty checkout was not uploaded.
- **Focused verification before release:** 38 username knowledge/estimator/backtest/runtime tests passed. The full suite was not claimed green because an unrelated Gift sales worker lock collision still needs separate triage.
- **Production behavior now live:** imported Telegram usernames can receive an immediate D1/learned estimate, while one bounded, non-blocking first-import evidence task can fetch/verify wallet-relevant evidence, write durable compact records, and refresh the estimate. It is capped (default 12 assets per request; at most 4 fast knowledge lookups) so it cannot fan out without bound.
- **Already-live dependent Workers:** the semantic identity Worker/registry v4 compatibility deployment remains live; legacy v3 knowledge retains only safe lexical fields until refreshed.

### v16 follow-up release

- **Commits:** `c99eb9c` (`Prioritize fresh exact username sale evidence`) and `e07c3cb` (`Harden identity valuation worker pipelines`).
- **Identity Worker:** version `27a827e0-312e-471c-9e51-29b8c2d1df9b` deployed successfully.
- **D1 projection:** protected refresh completed successfully after deployment: 13,791 username sales -> 114 `username-market-v16` baselines, then 50,240 DNS sales -> 182 DNS baseline groups. `identity-baseline-refresh-v1` finished in `complete` state at `2026-08-26T08:32:38.283Z`.
- **Railway API:** deployment `c9e6a094-76be-40d1-a1e8-cfd0e5d02668`, status `SUCCESS`. Its public `/api/health` reported that exact deployment revision, and `/api/username-estimator/status` reported `configured: true`, `ready: true`, `source: compact-d1`, `portfolioEstimatesEnabled: true`, `archetype_baselines: 114`.
- **Verification:** 39 focused username tests, 15 focused registry/identity-worker tests, and `npm run build:edge` passed. A 500-sale chronological run contained only no-earlier-exact-sale holdouts; its overall median factor error was `1.2518`, so it confirms v16 did not alter that broad cohort but cannot measure the sparse historical exact-sale cohort by itself.

### Current verified production state

- **Railway deployment:** `12d391a8-0b5d-4eec-ac65-1c1c7ce01bee`, status `SUCCESS`, deployed from isolated release commit `43958a5` (`Align API DNS runtime with v7 projections`).
- **Why it was required:** the app server still identified DNS estimates as `dns-market-v4` while compact D1 had `dns-market-v7` baselines, making the live DNS status appear ready but return zero usable baselines.
- **Live verification after deployment:** `GET /api/health` returned revision `12d391a8-0b5d-4eec-ac65-1c1c7ce01bee`; `/api/username-estimator/status` returned 114 compact-D1 baselines; `/api/dns-estimator/status` returned 186 compact-D1 baselines. Both are configured, ready, and portfolio estimates are enabled.
- **Identity Worker throughput release:** version `1153a767-dd47-47f7-a62b-3e922a6ca7f7` is deployed. A protected `/run/knowledge` call completed with username fast 8 / full 2 and DNS fast 2 / full 1 records written. The caps prevent source bursts while materially improving precomputed knowledge coverage.
- **No-sale premium-tail experiment rejected:** a candidate v17 longer-fragment lexical model was tested against a chronological holdout. Its expensive misses had no repeated independent lexical support, so it produced no improvement and was fully reverted. Do not revive this candidate without a new, evidence-backed validation result.
- **Latest focused verification:** after that rejection/revert, `node --test test/username-estimator.test.js test/username-runtime.test.js test/username-backtest.test.js` passed 34/34. No production code is pending from the rejected experiment.

## Exact Next Step At Interruption

1. Observe a real first import of a wallet with known username NFTs. Verify the immediate v16 estimate, bounded background evidence run, and later refreshed valuation through compact D1 endpoints/logs. Do not claim the evidence upgrade is live for a specific asset without observing it.
2. Let the two-tier knowledge Worker build coverage, then measure `preparedKnowledgeCoverage` and `byPreparedKnowledgeSignal` using a fresh `npm run backtest:usernames` run. Do not compare it directly to old cache-only artifacts; the ledger size changes continuously.
3. For the remaining never-sold premium-tail gap, only add a lexical/semantic signal after it has enough v4-prepared market coverage to beat the no-sale chronological holdout. Generic entity/attention signals and global multipliers remain unsafe.
4. Keep direct historical/comparable sale evidence first. If a model candidate is added, compare all USD bands and ordinary-name error before retaining it; do not retry the failed global multiplier or premium-median cohort blend.
5. Watch `identity-baseline-refresh-v1`: it was complete after refreshing 13,791 username sales into 114 groups and 50,240 DNS sales into 186 groups. The next due refresh is handled by the normal five-minute schedule in two phases.
6. Run focused tests, then a clean full-suite capture before the next release. Inspect git status/diff and do not push the broad dirty worktree without the user's explicit request.

## Working Style For The Next Agent

- Be direct and work to the point; the user was frustrated by long detours.
- Before editing, state exactly what will change in one or two sentences as required by `AGENTS.md`.
- Use `apply_patch` for manual edits.
- Prefer targeted `rg`, focused diffs, and focused tests. Avoid broad research unless it supplies a needed primary market fact.
- When making claims about a running server, data count, model result, or deployment, verify it first and say what was actually checked.
- Do not use skills or deploy Railway reflexively. The user explicitly dislikes both habits.
