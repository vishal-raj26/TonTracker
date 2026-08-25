# Telegram Collectible Username Valuation Research

Status: clean-room research and production model specification
Research date: 2026-08-19
Primary target: Telegram collectible usernames
Secondary target: transfer learning into TON DNS without price equivalence

## Executive conclusion

A Telegram username is not priced reliably by length, the last sale, a current ask, or a language
model alone. It is a thinly traded identity asset whose price is produced by five interacting
components:

1. transferable Telegram utility and exact-name scarcity;
2. semantic and commercial demand for the string;
3. current market regime and liquidity;
4. asset-specific evidence such as prior sales, bids, and asks;
5. transaction reliability and manipulation risk.

The production estimator should therefore be a calibrated mixture of experts. Exact repeat-sale,
bid/listing execution, comparable retrieval, structural regression, semantic scoring, and liquidity
models should each produce evidence. A learned gate should combine them according to evidence
quality. The app should return a median fair value, a credible interval, a quick-sale value,
confidence, and a concise explanation. It should never present an isolated ask or acquisition price
as fair value.

The expensive work can be done before a wallet connects. The verified market contains about
621,000 username items, which is small enough to feature and value offline. A wallet import should
only identify exact collection addresses and batch-read prepared valuation snapshots.

## What is being valued

The target is **current expected arm's-length transactable value in USD** for the NFT at the
valuation timestamp. It is not:

- the owner's acquisition cost;
- the seller's current ask;
- the highest historical sale;
- the current USD conversion of an old native-token sale;
- a forced-sale guarantee;
- the value of an account, channel, audience, or content attached to the name.

Every historical sale is converted using the native-token/USD rate at the event time. The underlying
NFT can be assigned to a Telegram account, bot, channel, or supergroup and works in global search and
deep links. Followers, messages, channel history, and account reputation do not transfer with the
NFT and must not be added to intrinsic value.

## Clean-room research method

No existing project estimator or project valuation document was used to choose the method. The
research proceeded from market mechanics and data:

- verified the contracts, collection addresses, and Telegram utility;
- enumerated the current username and DNS inventories;
- separated mint/primary auction, secondary sale, bid, ask, cancellation, and transfer events;
- converted sale labels into historical USD;
- measured market coverage, distribution, repeat sales, seller/buyer concentration, and listing
  behavior;
- ran chronological rather than random-split tests;
- tested structural, recency, character, comparable, and ensemble baselines;
- compared exact base strings across Telegram usernames and TON DNS;
- designed the production model only after evaluating those results.

## Data collected and tested

| Dataset | Coverage | Primary use | Limitation |
|---|---:|---|---|
| Verified username inventory | 621,263 unique NFTs | Full-market features and listing state | Snapshot, not event history |
| Verified TON DNS inventory | 189,450 unique NFTs | Cross-market inventory study | Snapshot, not event history |
| Canonical username sale ledger | 340,000 rows | Repeat-sale and market tests | Partial export through 2025-07-20 due Dune download quota |
| Full event aggregates | 874,732 username sale events | Market totals and recency | Aggregated, not row-level labels |
| Selected public sale sample | 1,488 names through 2026-08-19 | Semantic cold-start baselines | Selected toward publicly visible sales |
| Repeat-sale holdout | 11,050 later sales | Out-of-time validation | Only assets with repeat sales |
| Exact username/DNS overlap | 26,114 names | Cross-market feature design | Most names lack sales on both markets |
| Exact matched secondary sales | 382 names | Historical username/DNS relation | Thin segments and non-simultaneous sales |

The canonical event aggregate records 619,935 username mints, 874,732 sales, 1,122,827 bids,
11,749,805 put-on-sale events, and 11,403,596 cancellations through 2026-08-18. Counts and item
cardinalities are not interchangeable because approximate distinct counts and reissued/event-derived
items can differ.

## Market findings

### 1. Asks are not value labels

Only 18,100 verified usernames were listed in the inventory snapshot, about 2.9% of the market.
Among 15,761 positive asks, the native-token distribution was:

- p25: 20;
- median: 111;
- p75: 1,000;
- p90: 10,000;
- p99: 300,000.

This is seller intent with extreme censoring. An ask can be useful when the model estimates its
execution probability and expected time to sale. It cannot be used directly as fair value.

### 2. Primary auctions and secondary sales are different regimes

The partial canonical ledger contains 278,583 primary purchases and 61,417 secondary sales. Their
participant incentives, price discovery, and selection differ. They require separate features and
calibration. A primary auction closing price is acquisition evidence, not automatically the current
secondary value.

### 3. Prior sale is strong when it exists, but incomplete

The partial ledger contains 43,524 repeat-sale items. In an out-of-time test of 11,050 later sales,
carrying forward the prior historical-USD sale produced:

- median multiplicative error: 1.34x;
- 87.2% within 2x;
- 96.1% within 5x.

Adding a simple trailing market-regime adjustment moved the median error to 1.35x and 87.9% within
2x. The prior sale is therefore the strongest single repeat-asset feature, but it still needs age
decay, market adjustment, current order evidence, and manipulation scoring.

### 4. Length finds the scarce short tier, not semantic value

In secondary sales, all-letter names of 1-4 characters were rare and had a median historical value
around $16,845. The 5-6, 7-9, 10-12, and 13+ groups had medians around $23-$26 in the partial ledger,
while their upper tails differed substantially. Length identifies the mechanically scarce short
segment. It does not explain why an ordinary-length word, brand, phrase, or abbreviation becomes a
high-value outlier.

### 5. Raw string similarity is weak

The selected 1,488-name chronological test compared intentionally simple baselines:

| Baseline | Median error factor | Within 2x | Within 5x |
|---|---:|---:|---:|
| Robust recency ensemble | 1.71x | 60.1% | 92.6% |
| Structured recency Extra Trees | 1.72x | 60.5% | 91.5% |
| Recent structural median | 1.73x | 61.6% | 90.7% |
| Structured recency ridge | 1.90x | 53.2% | 88.6% |
| Structural segment median | 2.15x | 46.7% | 71.8% |
| Constrained nearest comparables | 3.43x | 35.4% | 57.9% |
| Character n-gram ridge | 5.33x | 11.7% | 49.0% |
| Global median | 40.62x | 13.1% | 17.0% |

The sample is selected and is not a production accuracy claim. It does reject three tempting ideas:
a global median, character resemblance as the main comparator, and a formula based mainly on length.

### 6. The market has a heavy semantic tail

The name's meaning affects buyer count and willingness to pay. Useful semantic groups include:

- dictionary words and short common phrases;
- personal names and surnames;
- geographic names;
- industries, products, professions, and high-intent commercial terms;
- verbs, emotions, communities, media, gaming, finance, and technology terms;
- abbreviations and acronyms;
- numbers and culturally meaningful numeric patterns;
- multilingual words and transliterations;
- known entities, trademarks, and emerging concepts.

These labels are not direct premiums. Frequency, memorability, commercial intent, language reach,
ambiguity, legal risk, and actual observed demand determine whether a category matters. Entity and
trademark matches can increase demand while simultaneously increasing legal/platform risk.

### 7. Liquidity is part of value

For thin assets, two names with similar long-horizon value can have very different immediate sale
prices. The estimator should model both fair value and quick-sale value. Useful liquidity evidence:

- unique bidders, not bid count alone;
- bid ladder depth and bidder concentration;
- segment sale velocity and time to sale;
- listing duration, repricing, cancellation, and relisting;
- market depth around the predicted price;
- recency and reliability of comparable sales.

## Feature hierarchy

### Highest-value evidence

1. recent arm's-length sale of the same NFT, adjusted for age and regime;
2. credible current bids from distinct participants;
3. recent, reliable sales of semantically and structurally comparable names;
4. listing execution evidence, including age and repricing;
5. robust segment and semantic priors.

### Static name features

- normalized base string and Unicode/confusable representation;
- character and byte length, letters/digits/underscores, repeated characters;
- script, language probabilities, tokenization, word count;
- dictionary and corpus frequency by language;
- pronounceability, phonetic simplicity, typing effort, spelling ambiguity;
- abbreviation likelihood and expansion count;
- semantic categories and multilingual embedding;
- commercial search intent and cross-platform name usage where terms permit;
- adult, impersonation, sanctions, trademark, and platform-policy risk.

### Dynamic market features

- historical sales in event-time USD and their reliability weights;
- current bids, bidder count, bid concentration, and bid age;
- asks, listing age, price revisions, cancellations, and relistings;
- market-stage, venue, contract version, and payment asset;
- rolling market and segment price indices;
- segment velocity, sell-through, and survival curves;
- comparable distance, evidence count, and evidence age.

### Misleading inputs to reject or constrain

- source-displayed USD converted with today's token price;
- current ask as a sale-equivalent label;
- account/channel followers or content as transferable value;
- a name-only marketplace label without collection-address verification;
- average price on a heavy-tailed sample;
- top-sale headlines as representative training data;
- random train/test splits that leak later information;
- LLM-generated prices or unsupported categories;
- cross-market fixed multipliers;
- duplicate events, self-sales, reciprocal cycles, and common-funder trades.

## Manipulation and reliability layer

Every event receives a reliability score rather than a simple valid/invalid flag. Signals include:

- buyer equals seller;
- the NFT returns to a prior owner within 30 days;
- reciprocal or multi-wallet ownership cycles;
- repeated buyer/seller pairs;
- buyer and seller funded by the same upstream wallet;
- price jumps unsupported by bids, comparables, or market movement;
- venue/contract anomalies and duplicate traces;
- excessive concentration in one actor cluster.

Suspicious events remain auditable but receive little or no training weight. Cluster attribution is
important because self-trade checks alone miss coordinated wallets.

## Recommended production estimator

All price models operate on `log(USD)` and emit quantiles, not only a point estimate.

### Expert A: exact-repeat model

Uses the same NFT's reliable sale path, sale age, time-varying market index, and current bids. It
dominates when fresh repeat evidence exists.

### Expert B: executable-market model

Models bid-to-sale and ask-to-sale execution. It estimates the latent clearing range from distinct
bids, ask age, repricing, and comparable order depth. It does not equate the highest bid or lowest ask
to fair value.

### Expert C: comparable retrieval model

Retrieves candidates through hard filters first: asset class, market stage, structural tier, script,
language, sale recency, and reliability. It then ranks by learned semantic and phonetic similarity.
Comparable aggregation is robust and recency-weighted.

### Expert D: structural quantile model

CatBoost or LightGBM predicts p10/p50/p90 from static, semantic, market, and liquidity features. Tree
models handle nonlinear interactions and missing evidence well and provide a strong tabular baseline.

### Expert E: semantic residual model

A multilingual text encoder predicts the residual left after structural and market effects. It is
trained on historical sales, pairwise ranking, and hard negative comparables. It must not independently
set the price.

### Expert F: hierarchical cold-start prior

A partial-pooling model estimates segment distributions across structure, language, semantics, and
market regime. It provides a broad, calibrated fallback for names with no direct history.

### Expert G: liquidity and time-to-sale model

A survival model estimates probability of sale at candidate prices over 7, 30, and 90 days. It turns
fair value into a separately reported quick-sale value.

### Learned gate and calibration

The gate weights experts by evidence freshness, reliability, sample size, comparable distance,
liquidity, and out-of-distribution score. It is trained out of time. Conformal calibration on rolling
holdouts expands intervals where errors have historically been larger.

## No-sale and sparse-sale usernames

A no-sale asset should not be unavailable by default. The route is:

1. derive static and semantic features offline;
2. select a narrow structural/semantic market regime;
3. retrieve only historical comparables available before the valuation time;
4. predict from the structural and semantic experts;
5. shrink toward the hierarchical segment prior according to evidence strength;
6. adjust for current market regime and liquidity;
7. emit a wide interval and lower confidence when evidence is thin.

If a name is out of distribution, legally ambiguous, malformed, or has no trustworthy market anchor,
the system should show a broad range or unavailable state rather than a false precise number.

## Output contract

Each valuation snapshot should contain:

```json
{
  "asset_type": "telegram_username",
  "nft_address": "0:...",
  "name": "example",
  "as_of": "2026-08-19T12:00:00Z",
  "fair_value_usd_p50": 1250.0,
  "fair_value_usd_p10": 620.0,
  "fair_value_usd_p90": 2900.0,
  "quick_sale_usd_30d": 880.0,
  "confidence": 72,
  "evidence_tier": "comparable_plus_bid",
  "evidence_age_seconds": 3400,
  "model_version": "username-2026-08-19.1",
  "explanation_codes": ["RECENT_DISTINCT_BIDS", "SEMANTIC_COMPARABLES"],
  "warnings": []
}
```

Confidence is about evidence and calibration, not whether the value is high. It should decrease with
old evidence, wide expert disagreement, few comparables, manipulation risk, and out-of-distribution
features.

## Validation protocol

The only acceptable main evaluation is walk-forward historical simulation:

1. choose monthly valuation cutoffs;
2. build every feature using only data available at each cutoff;
3. predict the next arm's-length sale;
4. evaluate separately by evidence tier, price band, language, structure, and liquidity;
5. measure median factor error, within-2x/5x, pinball loss, interval coverage, ranking quality,
   calibration, and quick-sale execution;
6. include delisted/unsold observations through survival and censored-listing evaluation;
7. compare against prior sale, recent segment median, lowest ask, highest bid, and production model;
8. run shadow deployment and monitor drift before promoting a version.

Random splits, sale-only accuracy, or a handful of famous names are not release criteria.

## Failure modes

- A new global event can reprice a semantic category before sales confirm it.
- Very rare short names have too few local comparables and enormous buyer-specific variance.
- Private negotiations and off-chain payments may not reveal the full consideration.
- Coordinated wallets can evade simple manipulation rules.
- Multilingual slang, transliteration, and emerging entities can be misclassified.
- A public assignment may imply demand but does not transfer the associated audience.
- Legal/platform intervention can make observed demand non-transferable.
- Historical price-feed gaps can prevent an accurate event-time USD label.

The product should expose these uncertainties through intervals, confidence, and warnings rather than
hide them behind decimal precision.

## Sources

- [Telegram Fragment collectible API and utility](https://core.telegram.org/api/fragment)
- [Telegram TeleMint contracts](https://github.com/TelegramMessenger/telemint)
- [TON Center v3 indexed data](https://docs.ton.org/ecosystem/api/toncenter/v3/overview)
- [TON analytics and public data lake](https://docs.ton.org/ecosystem/analytics)
- [DASH digital identifier valuation study](https://arxiv.org/abs/2210.10637)
- [NFT wash-trading detection](https://arxiv.org/abs/2305.01543)
- [TON ABI catalog](https://github.com/ton-blockchain/abis)
