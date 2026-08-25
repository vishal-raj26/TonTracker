# TON DNS Valuation: Source of Truth

Status: Product and architecture decision record

Last reviewed: 2026-08-13

Conversation source: https://chatgpt.com/share/6a7cf156-66e4-83e8-a077-ab667b906912

This document preserves the complete direction agreed in the shared TON DNS discussion and maps it to TonTrack's current implementation. Read it before changing TON DNS discovery, pricing, storage, AI classification, comparable selection, confidence, or UI states.

Executable TonTrack implementation plan: `docs/TON_DNS_ESTIMATOR_IMPLEMENTATION_PLAN.md`

## 1. What TON DNS Is

TON DNS is the on-chain domain-name system for The Open Network. A readable name such as `vixxance.ton` can resolve to a wallet or another TON resource instead of requiring a raw blockchain address.

A `.ton` domain is also a transferable on-chain NFT asset. Ownership is recorded on TON, so a domain can be held in a wallet, transferred, listed, auctioned, and traded.

The domain's utility can include:

- Wallet-address resolution
- TON Site or ADNL resolution
- TON Storage references
- Other records supported by the TON DNS contract standard

Domain ownership is not permanent without maintenance. Current official documentation describes annual renewal and re-auction after an expired domain is released. Renewal state and time to expiry may therefore become valuation or risk signals, but must be verified from chain data before display.

Official reference: https://docs.ton.org/foundations/web3/ton-dns

Product terminology uses `GRAM` for TON's native currency. Older APIs and historical records may still return `TON` or `Toncoin`; they are compatibility aliases only when the API explicitly identifies the currency as native.

## 2. Why DNS Pricing Is Different

There is no single universal floor for all `.ton` domains. Value can come from several independent dimensions:

- Structural scarcity: short length, numeric class, repeated characters, palindrome, sequence, and similar patterns
- Meaning: dictionary words, people, places, brands, industries, slang, concepts, and abbreviations
- Utility and memorability: pronounceability, brandability, commercial intent, and relevance to TON or Telegram
- Cultural context: lucky numbers, crypto terminology, community language, and emerging trends
- Market evidence: the domain's own history, comparable sales, auctions, bids, listings, failed listings, and market regime

The number of possible names and meanings is effectively unbounded. New slang, brands, people, and cultural references appear continuously. A useful portfolio app must still produce an immediate, defensible estimate for a previously unseen and unlisted domain.

## 3. Current TonTrack Implementation

The current app already provides a useful foundation:

- Wallet NFTs are loaded through TonAPI.
- Direct and indirect ownership are merged and deduplicated.
- TON DNS assets are recognized by the verified collection contract address, not by name alone.
- Native-currency listings accept API aliases `GRAM`, `TON`, and `Toncoin` only when `currency_type` is explicitly `native`.
- Jettons that merely call themselves GRAM are rejected.
- The current GRAM/USD rate is available.
- Node/Railway workers, PostgreSQL support, caches, and wallet-import infrastructure already exist.

Current pricing behavior is intentionally narrow:

```text
Exact owned domain has a verified native-GRAM listing
  -> use that asking price as the displayed value

No verified listing
  -> value unavailable
```

The relevant implementation currently lives in:

- `server.js`: `verifiedTonListing()` and `identityAssetFields()`
- `app.js`: `normalizeIdentityAsset()` and `identityAssetValue()`

This is an active-listing reader, not the final valuation model. It cannot value unlisted domains, and one seller can set an unrealistic asking price. An ask is market evidence, not proven fair value.

## 4. Non-Negotiable Pricing Principles

1. AI must never invent or directly choose the price.
2. The market engine determines the value from real evidence.
3. The semantic engine answers, "What kind of domain is this?"
4. The structural engine handles deterministic scarcity and patterns.
5. A single active listing must not become fair value automatically.
6. Every estimate must carry a range and confidence level.
7. Historical evaluation must use only information available before the tested sale.
8. Low-confidence output must be labeled honestly rather than presented as a precise live price.
9. Semantic classification should be cached; it should not run on every wallet view.
10. Market valuation must refresh as new evidence arrives without rerunning stable semantic analysis unnecessarily.

Canonical formula:

```text
Structure + semantics
  -> select the best comparable domains
  -> apply verified market evidence
  -> estimated GRAM value + range + confidence
```

Never use:

```text
LLM -> price
```

## 5. The Three-Engine Architecture

### 5.1 Structural Engine

This engine is deterministic code and does not require AI.

It should extract at least:

- Normalized label without `.ton`
- Character count and UTF-8/script information
- Letters only, numbers only, alphanumeric, or mixed
- Numeric class such as `2N`, `3N`, `4N`, and longer classes
- Letter class such as `2L`, `3L`, and longer classes
- Repetition pattern such as `AAAA`, `ABBA`, `ABBC`, or `AABB`
- Number of unique characters or digits
- Repeated runs and repeated substrings
- Ascending or descending sequences
- Palindromes and near-palindromes
- Leading or trailing zeros
- Hyphens and separators where valid
- Keyboard or visual patterns where defensible
- Dictionary-word and compound-word shape
- Token count
- Pronounceability signals
- Abbreviation/acronym shape

Example:

```text
1662.ton
  -> numeric
  -> 4N
  -> ABBC
  -> repeated 6
  -> 3 unique digits
  -> no zero
  -> no sequence
  -> no palindrome
```

Numeric comparables must be selected from numeric structure first. Embeddings alone are not suitable for numeric scarcity.

Example:

```text
8888.ton
  -> 4N
  -> AAAA
  -> one repeated digit
  -> deterministic scarcity
  -> cultural meaning of 8 may be added by the semantic layer
```

Short names also need structural priority. `ai.ton` is not an ordinary dictionary-domain comparable; it combines `2L` scarcity with abbreviation and commercial-category meaning.

### 5.2 Semantic Engine

The semantic engine understands meaning and context. It does not set a price.

It should identify:

- Language and script
- Dictionary meaning and part of speech
- Person, place, organization, brand, product, or known entity
- Industry and concept categories
- Abbreviations and acronyms
- Crypto, Telegram, and TON terminology
- Slang and community language
- Cultural significance
- Memorability
- Pronounceability
- Brandability
- Commercial intent
- TON/Telegram relevance
- Invented-word status

Agreed open-source model roles:

- `Qwen3-8B`: one-time structured semantic classification and enrichment
- `BGE-M3`: multilingual embeddings and semantic comparable retrieval

Why two models:

- Qwen3-8B explains meaning, category, context, and structured qualitative features.
- BGE-M3 places domains in a vector space so semantically similar historical domains can be retrieved efficiently.
- Neither model is allowed to emit the portfolio price.

Example structured enrichment:

```yaml
domain: gramdiary.ton
type: compound_brand
tokens: [gram, diary]
categories: [telegram, media, publishing]
brandability: 0.82
commercial_intent: 0.58
memorability: 0.76
ton_relevance: 0.91
dictionary_strength: 0.61
```

Model-use policy:

1. Run deterministic classification first.
2. Consult dictionaries, entity lists, and the growing TON-specific meaning database.
3. Generate/search embeddings.
4. Invoke Qwen3-8B only when meaning is uncertain or semantic understanding could materially change valuation.
5. Store the resulting semantic profile permanently with a model/schema version.

The shared discussion estimates that only roughly 5-15% of names should need LLM enrichment after deterministic and embedding stages. This is a design target, not a measured production statistic.

Qwen3-8B plus BGE-M3 is the agreed V1 direction. Mistral Small 3.2 24B was considered unnecessarily heavy for this narrow classification task. Gemma 3 4B remains a possible benchmark alternative, not the selected default.

### 5.3 Market Engine

This is the most important engine and the final authority for numeric valuation.

It should ingest and distinguish:

- Finalized sales
- The domain's own previous sales
- Initial auctions and auction settlements
- Current bids and historical bids
- Active listings
- Listing removals and failed/stale listings
- Previous acquisition cost
- Resale multiples
- Buyer and seller
- Marketplace and transaction hash
- Market-wide volume, liquidity, and trend regime
- Native GRAM price and timestamp

For every historical market event, retain enough provenance to reproduce and audit it. Store the native GRAM amount as the canonical market value. Historical USD should use the exchange rate at the event timestamp; current estimates can be converted to current USD at display time.

Listings are signals, not sales:

- A finalized arm's-length sale is strong evidence.
- The domain's own recent sale is especially strong when still relevant.
- A real current bid can provide a lower-bound signal.
- Several consistent active asks can help describe the current market.
- One extreme ask is weak evidence and must not set the estimate.
- Expired, cancelled, ambiguous, or non-native-currency listings must not be treated as completed value evidence.

The market dataset should support filtering or down-weighting:

- Self-sales
- Repeated buyer/seller loops
- Wash-trade patterns
- Duplicate events
- Failed or reverted transactions
- Currency mismatches
- Extreme outliers unsupported by neighboring evidence
- Stale asks
- Evidence from a materially different market regime

## 6. Comparable Selection

For an unseen name such as `supernova.ton`, the engine should combine two searches.

Structural candidates:

- Single-word domains
- Similar length
- Similar dictionary and linguistic shape
- Similar abbreviation or scarcity class
- Similar brandability/commercial feature bands

Semantic candidates:

- `galaxy.ton`
- `nebula.ton`
- `cosmos.ton`
- `space.ton`
- Other historically traded names close in BGE-M3 embedding space

The pricing candidates come from the intersection or weighted union of those sets. Real market records attached to those candidates determine the price.

Comparable priority should generally be:

1. The exact domain's valid recent sale history
2. Very close structural and semantic matches
3. Exact structural class matches
4. Strong semantic matches with similar scarcity
5. Broader category and market baselines

The final implementation must use robust aggregation rather than a simple arithmetic mean. Candidate approaches include weighted median, trimmed log-price statistics, quantiles, recency decay, similarity weighting, and liquidity weighting. The exact formula must be selected through backtesting, not intuition alone.

## 7. Immediate Valuation and Caching

First encounter:

```text
new domain
  -> structural classification
  -> dictionary/entity lookup
  -> embedding generation
  -> optional Qwen3-8B enrichment
  -> comparable retrieval
  -> market valuation
  -> save classification, evidence, estimate, range, and confidence
```

Subsequent encounter:

```text
database lookup
  -> return cached classification immediately
  -> use current cached valuation or refresh market calculation if stale
```

Semantic features change slowly. Market value changes faster. They need separate versions and refresh policies.

For the roughly 175K existing domains discussed:

1. Download the verified domain collection.
2. Classify deterministic structures locally in bulk.
3. Generate BGE-M3 embeddings in batches for the remaining names.
4. Apply dictionary/entity and TON-specific vocabulary enrichment.
5. Run Qwen3-8B only where semantic uncertainty could materially affect price.
6. Process newly registered domains incrementally after the initial backfill.

Do not send 175K individual prompts to an LLM.

## 8. Growing Meaning Database

Store reusable concepts discovered during enrichment.

Example:

```text
wagmi
  -> crypto slang
  -> "We're All Gonna Make It"
  -> community term
  -> high crypto relevance
```

Later names such as `wagmiclub.ton` can inherit this concept without repeating the same expensive analysis. The system should become more self-sufficient as its meaning dictionary grows.

Every generated meaning record needs provenance, model version, confidence, and an override path. AI-derived labels must never silently become unquestionable facts.

## 9. Valuation Output and Confidence

The product output is not a falsely precise number. It should expose:

- Estimated GRAM value
- Current USD equivalent
- Plausible low/high range
- Confidence score or clear confidence band
- Evidence freshness
- Number and quality of comparables
- Estimated versus directly listed status

Example:

```text
Estimated value: 730 GRAM
Range: 610-860 GRAM
Confidence: Medium
Evidence: 8 comparable sales
```

Confidence should reflect at least:

- Exact-domain history availability
- Number of usable comparables
- Structural similarity
- Semantic similarity
- Comparable recency
- Price dispersion
- Liquidity and transaction quality
- Agreement between sales, bids, and listings
- Market-data completeness
- Semantic-classification certainty

A recognizable domain with extensive evidence may have high confidence. A new invented word with weak comparables can still receive an estimate, but it must be visibly low confidence.

## 10. Learning From the Market

The estimator improves when new verified events enter the market dataset.

If invented 6-8 character names initially support a 9 GRAM estimate, but later repeatedly sell around 16-21 GRAM, the comparable distribution changes and future valuations should move accordingly.

This is market learning, not automatic model fine-tuning. The pricing engine updates because its verified evidence changed.

## 11. Backtesting and Release Gate

Accuracy must be measured historically before estimated values affect portfolio totals broadly.

Backtest procedure:

1. Select a historical sample of completed DNS sales.
2. For each sale, hide that sale and all later information.
3. Run the estimator using only information available before the sale time.
4. Compare predicted range and midpoint with the actual sale.
5. Segment errors by domain class, confidence, liquidity, and price tier.
6. Investigate severe misses and adjust feature, filtering, weighting, or confidence logic.

Track metrics such as:

- Median absolute percentage error
- Log-price error
- Percentage of actual sales falling inside the predicted range
- Error by numeric, short-letter, dictionary, entity, invented, and compound classes
- Calibration of confidence bands
- Error under changing market regimes

An estimate should not be promoted as high confidence until historical tests justify that confidence.

## 12. Storage and Service Boundaries

TonTrack implementation decision:

- Keep the gift D1 databases dedicated to gift floors and sales.
- Use the dedicated compact identity D1 ledger for TON DNS assets, finalized market events, prepared estimates, comparables, historical USD attribution, and checkpoints. It is separate from Gift D1 databases.
- Do not retain full dense embeddings, raw source payloads, or repeated listing snapshots in D1.
- Use an external vector-capable store only if measured retrieval quality justifies it; embeddings are optional enrichment and can never block deterministic valuation or wallet imports.
- Keep background ingestion/classification workers separate from wallet-import request latency.

Suggested logical records:

- `dns_domains`
- `dns_market_events`
- `dns_structural_features`
- `dns_semantic_profiles`
- `dns_embeddings` or external vector references
- `dns_valuations`
- `dns_valuation_comparables`
- `dns_meaning_dictionary`
- `dns_worker_checkpoints`

Every valuation should preserve its engine version and selected comparable IDs so a displayed number can be explained and reproduced.

## 13. Cost Strategy

Most of the system should remain deterministic and inexpensive:

- TON ownership and chain data: public or existing TON infrastructure
- Structural analysis: local backend code
- Comparable engine: backend and database
- BGE-M3 embeddings: locally hosted batch/incremental processing where practical
- Qwen3-8B: selective one-time enrichment, not per portfolio view
- Cached classification: reused across every wallet holding the same domain

The main constraint is clean market data and compute capacity, not per-view AI API cost. Infrastructure cost must be measured before promising near-zero cost in production.

## 14. Build Sequence

The target V1 from the shared discussion includes all of these signals:

```text
historical transactions
+ exact domain history
+ structural classification
+ comparable sales
+ semantic similarity
+ current listings and bids
-> estimated GRAM value + range + confidence
```

Build it in this dependency order:

1. Verify and document every market source and event type.
2. Build the normalized DNS market-event ledger.
3. Build the deterministic structural classifier and tests.
4. Build the first structural comparable engine.
5. Add robust range and confidence calculation.
6. Create a time-aware backtesting harness.
7. Generate BGE-M3 embeddings and semantic retrieval.
8. Add the TON-specific meaning dictionary.
9. Add selective Qwen3-8B enrichment for uncertain/high-impact cases.
10. Re-run backtests and calibrate weights and confidence.
11. Add background cache refresh and incremental new-domain processing.
12. Replace the current listing-only presentation only after the estimator passes its release gates.

Data collection and backtesting begin first because semantic intelligence cannot compensate for missing or dirty market evidence. This does not mean semantics are optional in the agreed product; semantic similarity is part of the target V1.

## 15. Decisions That Must Not Drift

- TON DNS is a transferable on-chain domain NFT with utility, not a fungible token.
- Exact collection-contract matching remains mandatory.
- The current exact listing is retained as a market signal, not trusted as fair value by itself.
- Unlisted domains should ultimately receive an estimate when usable evidence exists.
- Numeric and structural names are classified deterministically first.
- `Qwen3-8B` performs selective semantic classification.
- `BGE-M3` performs semantic retrieval.
- AI never sets the price.
- Market evidence determines the estimate.
- Every estimate has a range and confidence.
- Semantic work is cached and reused.
- The initial collection is batch processed; new domains are incremental.
- Historical backtesting determines whether the model is accurate enough to ship.
- DNS valuation storage stays separate from the gift D1 capacity problem.

## 16. Open Verification Items

These are intentionally not treated as solved:

- Verified: TonAPI provides the live, verified TON DNS ownership catalog. TON Center's indexed transfer and sale-contract endpoints are the production source for DNS secondary-market sale evidence; only a completed native-GRAM sale contract behind a DNS ownership transfer enters the compact ledger, with USD converted at the exact sale timestamp. The public TON Lake partitions available to this project stop in 2022, so they are archival reconciliation only and must never drive live valuation.
- How Getgems sale contracts and auction settlements should be decoded and normalized
- Which current bids are reliably accessible and attributable
- How to identify failed listings versus simple cancellations
- The exact number of existing active domains at implementation time
- Railway CPU/RAM suitability for Qwen3-8B and BGE-M3
- The vector index technology and embedding dimensionality/storage format
- The robust pricing formula and feature weights
- Confidence thresholds for inclusion in portfolio totals
- Renewal/expiry data availability and its measured effect on price

Resolve these through source proofs and backtests before implementation decisions are declared final.

## 17. Public-Source Research Update (2026-08-24)

Additional research does not reveal a legitimate hidden feed that can replace
verified market evidence. The implementation decision is therefore explicit:

- Public Telegram groups, social posts, and marketplace discussions may seed
  trend vocabulary or candidate discovery only. They must never create a sale,
  a comparable price, or a portfolio value.
- The official Telegram MTProto method `fragment.getCollectibleInfo` can return
  a collectible's purchase date and amount, but it is user-authorized only.
  A Bot API token and a Mini App `initData` payload cannot call it. It may be
  offered later as an optional user-consented reconciliation, never as a
  required server-side ingestion dependency.
- Getgems collection history is an optional authenticated discovery source. A
  direct unauthenticated request returned `401` during the 2026-08-24 source
  proof, so it must not be presented as a free dependency. Use its normalized
  result only after the native-GRAM settlement and NFT identity are verified on
  chain.
- TON Center v3 can query sale and auction contracts in batches, with a public
  rate limit. It is the independent settlement verifier for known Getgems or
  Fragment evidence, not a replacement for marketplace discovery.

The resulting no-subscription production path remains:

```text
TON Center public indexed discovery (paced background work)
  -> NFT/domain identity check
  -> completed native-GRAM settlement verification
  -> compact sale + event-time USD record
  -> refreshed archetype baseline / exact valuation in D1
  -> immediate wallet-import read
```

Wallet imports now also register a compact DNS NFT-address-to-domain alias in
the valuation D1 model. This lets a pre-indexed domain valuation resolve to the
actual wallet NFT without duplicating sales, raw payloads, or per-wallet price
work.
