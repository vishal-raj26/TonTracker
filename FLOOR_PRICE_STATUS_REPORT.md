# TonTrack Floor Price Status Report

**Status date:** June 14, 2026  
**Scope:** Telegram collectible gift floor prices only

## Executive Summary

TonTrack already has working collection-level and collection-by-model floor pricing, snapshot storage, historical reads, and a fast registry-first frontend path.

We also proved that Thermos can return an exact floor for one:

`Collection x Model x Backdrop`

However, Thermos does not expose a verified public endpoint that returns every such intersection as grouped data. The current complete-market method must paginate through every active listing and calculate the intersections locally.

That method is accurate, but one complete refresh currently takes approximately **11-14 hours**. Therefore, refreshing every intersection and presenting it as synchronized three-hour history is not achievable with the current anonymous Thermos API and request limits.

## Floor Levels

| Level | Current condition |
|---|---|
| Collection floor | Implemented and stored |
| Collection x Model floor | Implemented and stored |
| Collection x Backdrop floor | Available from Thermos attributes, but it is not a model intersection |
| Collection x Model x Backdrop floor | Exact lookup verified; full registry ingestion is incomplete |
| Historical collection/model floors | Implemented |
| Historical exact-combination floors | Schema and storage paths implemented; complete recurring coverage is not implemented |

## What We Achieved

### Collection Floors

- Thermos collection floors can be fetched independently of wallet imports.
- Collection snapshots can be stored in PostgreSQL.
- Local JSON remains available as a development fallback.
- Unchanged values are deduplicated instead of creating unnecessary rows continuously.
- The frontend can read stored values instead of making users wait for Thermos.

### Model Floors

- Thermos attribute data provides collection-scoped model floors.
- Model-level snapshots are stored separately from collection floors.
- Model floors are matched using normalized collection and model keys.
- One stored model floor can be reused for every matching wallet holding.
- Missing values remain unavailable instead of falling back to an unrelated collection floor.

### Exact Model and Backdrop Floors

- Thermos accepts collection, model, and backdrop filters together.
- An exact filtered request returns the cheapest matching listing and matching listing count.
- Verified example:
  - Collection: `Toy Bear`
  - Model: `Noir Et Rose`
  - Backdrop: `Ivory White`
  - Observed floor during testing: `77 TON`
  - Matching listings during testing: `2`
- Changing only the backdrop produced a different valid floor, confirming that backdrop affects the intersection.
- An invalid backdrop produced zero results, confirming that Thermos applies all filters together.

### Storage

Two exact-combination storage paths now exist:

1. PostgreSQL table `gift_combo_floor_snapshots` for timestamped combination history.
2. Cloudflare D1 registry using 32 buckets per collection for compact current-state reads and changed-bucket history.

The D1 worker:

- Upserts the current collection metadata.
- Replaces each current combination bucket.
- Adds a history bucket only when its JSON changed.
- Deletes history older than 30 days through a daily Cloudflare cron.
- Supports direct and batched combination reads for the application.

## Current Full-Registry Progress

The latest saved checkpoint contains these completed collections:

| Collection | Listings scanned | Exact combinations found |
|---|---:|---:|
| Sleigh Bell | 2,790 | 831 |
| Snoop Dogg | 20,574 | 782 |
| Input Key | 5,166 | 806 |

`Lunar Snake` is partially scanned:

- 300 of 376 pages completed
- 7,506 total listings reported
- 895 combinations found so far

The discovered Thermos collection list contains approximately **114 collections**, so the complete baseline has not been finished.

## Current Scanner Logic

The combination scanner currently:

1. Fetches the Thermos collection list.
2. Processes one collection at a time.
3. Requests active listings sorted by ascending price.
4. Receives at most 20 listings per page.
5. Uses one request worker.
6. Waits at least 900 ms after each request.
7. Groups every listing by normalized model and backdrop.
8. Keeps the minimum listing price for each exact combination.
9. Counts listed items for each combination.
10. Saves a local checkpoint every 10 pages.
11. Uploads the completed collection to D1 in 32 buckets.
12. Marks the collection complete and deletes its temporary work file.

The checkpoint allows an interrupted collection to resume. Completed collections are skipped unless the scanner is run with `--reset`.

## Timing

The market contained roughly **622,000 active listings** during measurement.

At 20 listings per request, a full pass requires approximately **31,100 requests**.

| Refresh method | Estimated duration | Result |
|---|---:|---|
| Current serial full scan | 11-14 hours | Accurate but too slow for three-hour history |
| Directly query ~90,000 known combinations at 1 request/second | ~25 hours | Not viable |
| Directly query ~90,000 combinations in 3 hours | Requires ~8.3 requests/second | Sustained rate limiting observed |
| User-held combinations only | Depends on active combination count | Practical for three-hour refreshes |

Earlier collection and model floors were faster because Thermos already returns those as grouped attribute statistics. Exact model-plus-backdrop floors require either an exact query for every combination or scanning all listings.

## Tests Performed

### Thermos Attribute Endpoint

The attribute response was inspected for models, backdrops, and symbols.

It returns separate marginal groups:

- `Collection x Model`
- `Collection x Backdrop`
- `Collection x Symbol`

It does not return:

- `Model x Backdrop`
- `Model x Symbol`
- `Collection x Model x Backdrop`

The model and backdrop groups cannot be merged mathematically to obtain an exact intersection floor. The cheapest model listing and cheapest backdrop listing may be different gifts.

### Thermos Listing Pagination

- The public listing endpoint was tested with larger requested page sizes.
- Anonymous responses remained capped at 20 listings per request.
- Sorting by ascending price works.
- Exact collection, model, and backdrop filtering works.

### Concurrency and Rate Limits

A short burst succeeded at higher concurrency, but a sustained test did not:

- 200 attempted requests at concurrency 8
- 125 successful responses
- 75 HTTP `429` responses

This showed that burst success cannot be treated as a safe sustained refresh rate. After the test, even individual requests were temporarily rate-limited.

### External Sources

#### xGift

- xGift was investigated for bulk and filtered market access.
- Access and authentication are experimental and unreliable.
- No stable, verified public grouped exact-combination endpoint was obtained.
- It is not suitable as TonTrack's only production source without official access.

#### see.tg

- Bundles, network behavior, and available data were investigated.
- It helped with gift presentation and enrichment research.
- It did not provide a verified replacement for complete, refreshed exact-combination floor ingestion.
- Previously malformed or scaled values demonstrated why its data cannot be trusted without validation.

## What Failed

### Merging Model and Backdrop Floors

This cannot produce an exact floor.

For example:

- Model floor: cheapest gift having model A
- Backdrop floor: cheapest gift having backdrop B

Neither value proves the cheapest gift that has both model A and backdrop B.

### Full Three-Hour Combination Refresh

The current full scan takes longer than the requested three-hour interval. Early collections would already be many hours older by the time later collections finished.

### High-Concurrency Thermos Scanning

Increasing concurrency reduced short-test duration but caused sustained `429` responses. This risks incomplete snapshots and temporary blocking.

### Current Cloudflare Schedule

The configured daily Cloudflare cron only removes combination history older than 30 days. It does not fetch or refresh prices.

### Automatic Recurring Combination Refresh

The combination scanner currently runs through:

`npm run worker:gift-combos:once`

It is not yet connected to a reliable recurring production scheduler. A true refresh also requires resetting completed collection checkpoints.

## Accuracy Condition

TonTrack should only show an exact combination floor when:

- Collection, model, and backdrop all match.
- The source response is successful and unambiguous.
- The price is positive and has a real matching listing.
- The record includes its actual fetch timestamp.
- The value has not exceeded the accepted freshness window.

TonTrack must not:

- Add or combine separate model and backdrop floors.
- Substitute a model floor for an exact combination floor.
- Present an incomplete scan as a synchronized market snapshot.
- Present stale values without a visible timestamp or stale state.

## Recommended Production Architecture

### Baseline

Run one complete market scan to populate all currently listed combinations in D1. Treat this as a baseline, not a three-hour snapshot.

### Fast User Pricing

When a wallet is imported:

1. Extract its unique collection, model, and backdrop combinations.
2. Read those combinations from D1 in batches.
3. Display verified stored prices immediately.
4. Mark missing or stale combinations for priority refresh.

This keeps wallet loading fast because the user does not wait for Thermos listing pagination.

### Three-Hour Refresh

Refresh only combinations that are:

- Held by active/imported wallets.
- Recently requested.
- Missing.
- Older than the accepted freshness period.

This is the only practical anonymous-API path to meaningful three-hour freshness.

### Full Reconciliation

Run the complete listing scan less frequently, such as daily or weekly, to:

- Discover newly listed combinations.
- Remove combinations that no longer have listings.
- Correct drift in the priority registry.
- Verify that user-focused refreshes did not miss market changes.

### History

- Store timestamps per combination, not one timestamp for the whole market.
- Write history only when the price or listing count changes.
- Retain 7-30 days according to storage requirements.
- A seven-day chart becomes available only after seven days of actual collection; it cannot be reconstructed from a newly created baseline.

## Present Condition

The project has proved the exact pricing method and has the storage/read infrastructure needed for it. What remains unresolved is economical market-wide refresh frequency.

The accurate current position is:

- **Collection floors:** operational.
- **Model floors:** operational.
- **Exact combination lookup:** operational.
- **Complete exact-combination baseline:** partially populated.
- **Three-hour market-wide exact refresh:** not operational and not feasible with the current public Thermos limits.
- **Three-hour active-user combination refresh:** feasible, but not yet implemented as the recurring production strategy.
