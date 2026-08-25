# Telegram Username and TON DNS Relationship Study

## Starting premise

This study accepts the product premise that TON DNS is less valuable than the equivalent Telegram
collectible username. The research question is not whether to use that direction. It is how the gap
changes by name type, market evidence, liquidity, and time without forcing a fixed multiplier.

## Why the assets differ

### Telegram collectible username

- resolves to `t.me/name` and `name.t.me`;
- participates in Telegram global search;
- can be assigned to an account, bot, channel, or supergroup;
- has direct identity, discovery, communication, and brand utility inside Telegram;
- ownership is perpetual until transferred/sold, subject to platform rules.

### TON DNS

- resolves TON wallet, TON Site/ADNL, storage, and other DNS records;
- is an NFT in the official `.ton` collection;
- has an annual renewal requirement and no grace period;
- is primarily useful inside the TON ecosystem rather than Telegram's global identity/search layer;
- has different auction, listing, and lifecycle behavior.

The username carries a broader immediate distribution surface. DNS utility is real but narrower, and
renewal introduces lifecycle risk. Audience attached to a Telegram account/channel still does not
transfer with the username NFT.

## Inventory evidence

The clean-room inventory snapshots contain:

- 621,263 verified Telegram username NFTs;
- 189,450 verified TON DNS NFTs;
- 26,114 exact normalized base-string overlaps, 13.8% of DNS inventory.

Current listed share differs sharply:

- usernames: 2.9%;
- DNS: 16.1%.

This suggests materially different supply-to-market and liquidity behavior. Listing presence alone
does not establish demand.

## Why active-ask ratios fail

Only 277 exact overlaps had positive asks on both sides. Their username/DNS ask ratio had:

- median: 4.00x;
- p25: 0.86x;
- p75: 20.00x.

By structural segment, median ask ratios ranged from 0.05x to 31.37x. Some DNS asks even exceeded
username asks, which conflicts with the product premise but is unsurprising because asks are
unexecuted seller choices. This evidence rejects a fixed ask-based discount; it does not overturn the
premise.

## Canonical matched-sale evidence

The stronger test joined official collection events through exact decoded base strings. It used each
asset's latest arm's-length secondary sale, excluded self-sales and primary auctions, and converted
both into USD at their respective event times.

Across 382 exact-name pairs:

- username/DNS ratio p25: 3.62x;
- median: 8.43x;
- p75: 29.08x;
- p10-p90: 1.60x-123.39x.

Because sales were not simultaneous, a 180-day gap subset was also tested. Across 196 pairs:

- p25: 3.76x;
- median: 7.77x;
- p75: 20.81x.

Structural segments remain highly different:

| Segment | <=180d pairs | Username/DNS p25 | Median | p75 |
|---|---:|---:|---:|---:|
| Letters 1-4 | 6 | 24.37x | 118.40x | 212.66x |
| Letters 5-6 | 20 | 2.62x | 17.97x | 40.00x |
| Letters 7-9 | 25 | 3.27x | 11.71x | 28.28x |
| Letters 10-12 | 99 | 3.97x | 6.53x | 12.43x |
| Letters 13+ | 43 | 3.89x | 8.66x | 19.28x |

Short-segment samples are thin and should have wide uncertainty. The evidence nevertheless shows
that the relationship is nonlinear and stronger for scarce short Telegram handles.

## Interpretation constraints

- A matched historical sale is not a simultaneous appraisal.
- Event-time USD removes token-price conversion error but not market-regime drift.
- Latest-sale pairing is selected toward liquid names.
- Manipulation rules used here are basic; production requires wallet-cluster graph scoring.
- Some off-chain consideration may be missing.
- Segment medians describe populations, not an individual name.

These ratios are evidence for a learned cross-market feature, never a conversion table.

## Separate DNS estimator

The DNS estimator should retain its own experts:

1. exact DNS repeat-sale expert;
2. DNS bids/listings execution expert;
3. DNS-only comparable retrieval;
4. DNS structural/semantic quantile model;
5. DNS liquidity/survival model;
6. hierarchical DNS cold-start prior;
7. username cross-market prior.

DNS-specific features include:

- renewal age and time to lifecycle risk;
- configured wallet, site/ADNL, storage, or resolver records;
- delegation/usage state;
- DNS sale velocity and bidder depth;
- official collection status;
- DNS-specific market regime and listing supply.

## Username-derived cross-market prior

For an exact overlapping string, compute a username fair-value distribution first. Feed the DNS model:

- username p10/p50/p90, not a single price;
- username evidence tier and confidence;
- exact-match flag;
- segment-conditioned historical relationship;
- sale-time distance and market-regime features;
- semantic category and structural tier;
- whether evidence is direct sale, bid, ask, or model-only.

For a DNS string without an exact collectible username, use semantic username comparables only after
hard structural/language filters. The DNS gate learns how much to trust this prior from historical DNS
outcomes. Strong recent DNS evidence overrides it. With weak DNS evidence, it nudges the DNS prior but
widens uncertainty.

The known direction can be encoded as a soft monotonic prior or regularizer. It should not clamp every
individual estimate below a noisy username point estimate, because both estimates contain error.

## Comparative backtest

For each historical cutoff:

1. train the username estimator on information available before the cutoff;
2. generate username distributions for exact and semantic counterparts;
3. train two DNS models: DNS-only and DNS plus username cross-market features;
4. predict the next reliable DNS secondary sale;
5. compare median factor error, pinball loss, interval coverage, rank correlation, and quick-sale
   calibration;
6. break results down by exact overlap, semantic-only match, no username evidence, length, language,
   usage state, renewal state, and liquidity;
7. retain the cross-market feature only where it improves out-of-time performance and calibration.

The release decision is empirical. If username evidence hurts a segment, the gate should learn near-zero
weight for that segment.

## Product behavior

The app should label the estimate by its actual evidence:

- `Market-backed`: strong recent DNS evidence;
- `Comparable-backed`: several reliable DNS comparables;
- `Cross-market assisted`: username evidence materially contributed;
- `Model estimate`: sparse evidence and broad interval;
- `Unavailable`: no defensible anchor or severe data-quality/risk issue.

Do not expose a username/DNS multiplier. Show a value range, confidence, evidence age, and short reason.

## Sources

- [Telegram collectible username mechanics](https://core.telegram.org/api/fragment)
- [TON DNS foundations and lifecycle](https://docs.ton.org/foundations/web3/ton-dns)
- [TON DNS standard TEP-81](https://github.com/ton-blockchain/TEPs/blob/master/text/0081-dns-standard.md)
- [TON DNS contract](https://github.com/ton-blockchain/dns-contract)
- [Dune Spellbook decoded DNS model](https://github.com/duneanalytics/spellbook/blob/main/dbt_subprojects/daily_spellbook/models/ton/dns/dns_ton_domain_latest_info.sql)
