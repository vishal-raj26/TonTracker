# Telegram Username Market Source Policy

## Purpose

This policy keeps the Telegram Username valuation system accurate, legal to
operate, and responsive at wallet-import time. A market quote is useful only
when it can be independently identified, timestamped, and attributed to the
correct collectible username.

## Source Tiers

### Tier 1: valuation evidence

Only these records may affect a portfolio estimate or an archetype baseline:

1. A completed public Fragment sale with a stable identity, username, native
   GRAM amount, and timestamp. This is public-market evidence, not a claim
   of independent on-chain confirmation.
2. The same sale's GRAM/USD value calculated from a rate observed at the sale
   timestamp.
3. A compatible on-chain confirmation when a real NFT item address, amount,
   and timestamp agree. This promotes the record to `chain-confirmed`; an
   ordinary NFT transfer never becomes a sale on its own.

The ledger deduplicates evidence by immutable sale ID and keeps only normalized
fields needed to rebuild valuations. It does not store raw HTML, cookies,
wallet sessions, private messages, or group content.

### Tier 2: discovery and context

Public Fragment pages, official Telegram documentation, and public blockchain
indexers can find candidates and verify ownership. They are not price evidence
until the Tier 1 conditions are met.

Current listings, bids, offers, failed auctions, social posts, and community
claims can be displayed as context in a future UI, but must not set a portfolio
value. They are easy to manipulate and are not completed sales.

### Prohibited inputs

The application must not use:

- private Telegram groups, private messages, leaked datasets, or paid group
  access;
- copied browser cookies, Telegram login sessions, or a user's Mini App
  `initData` to crawl the market;
- undocumented endpoints as the only durable source of truth;
- manual claims of an off-market sale without public verifiable settlement.

## Runtime Design

1. A bounded background discovery worker ingests only public candidate sales
   and persists its cursor before each next page. It limits prefix depth,
   requests per page, and the delay between pages; a public-site defer applies
   a longer persisted cooldown.
2. Historical USD attribution and identity validation happen before a sale is
   written to `identity_sales`.
3. The baseline worker rebuilds exact-name values and structural baselines from
   that compact evidence. It publishes only the prepared projection to D1.
4. Wallet import performs one D1 batch lookup by real NFT address and canonical
   username. A miss may queue an alias refresh, but never starts crawling in
   the request path.
5. If public evidence is insufficient, the UI shows `processing`, `indicative`,
   or `unavailable` rather than inventing a market value.

## Operational Constraint

Fragment has no documented, unauthenticated, comprehensive public sales API.
The public web surface can rate-limit or change without notice. Therefore the
background crawler is intentionally bounded, resumable, and non-critical: it
must never block an import, loop through an unbounded prefix tree, or restart
from zero after a deployment.

Telegram's documented `fragment.getCollectibleInfo` is useful for a visible
collectible's purchase metadata, but it is user-authorized and cannot power a
server-side market crawl. Getgems documents NFT history and listing endpoints,
but its public API requires credentials. Neither limitation is a reason to
substitute private groups, copied sessions, or a hidden endpoint. Public social
channels may help discover a name or trend for manual research only; they do
not enter the valuation ledger.

If a legitimate indexed market-data provider or official API becomes available,
it may replace the public discovery adapter after a shadow comparison verifies
sale identity, timestamp, native amount, coverage, and historical USD parity.

### Public settlement adapter

`USERNAME_PUBLIC_SETTLEMENT_SOURCE_URL` is an optional adapter for a public
chain index. It accepts only finalized settlements with the real username NFT
address, transaction hash or trace ID, event time, native GRAM amount,
normalized username, and verified Username collection address. The adapter
rejects listings, transfers, private observations, and rows without a public
settlement identity. A matching TON Center transaction promotes the record to
`chain-confirmed`; otherwise it remains `market-reported`.

## Public-source audit: 2026-08-24

The following public, read-only path was tested against a bounded sample of
well-known collectible usernames:

1. Read the public `fragment.com/username/<name>` ownership history.
2. Read the page's public current-owner address.
3. Resolve the owner's collectible NFT from the verified Telegram Username
   collection through TON Center.
4. Match the public Fragment sale timestamp and gross GRAM amount to that
   exact NFT's on-chain settlement. A seller net-proceeds amount is allowed
   only when it is within the documented bounded marketplace-fee tolerance.

Five sampled public history rows (`katrinakaif`, `kick`, `casino`, `auto`, and
`fintopio_bot`) resolved to the real Username NFT and passed this settlement
match. `scum` resolved to a real NFT but had no public ownership-history sale
row, so it correctly produced no sale evidence. This validates the join, not
market-wide coverage: the public web search remains discovery-only and must
never be interpreted as a complete sales archive.

Public Telegram channels and groups are not an ingestion source. Their posts
are advertisements or unverified claims, commonly omit final settlement data,
and can be edited or deleted. They may be used only for manual research, never
for a displayed valuation, comparable, baseline, or confidence score.

Telegram's documented `fragment.getCollectibleInfo` returns a visible
collectible's purchase date and price to an authenticated Telegram user. That
is useful as a future user-authorized, per-asset proof feature, but it cannot
be run server-side or used to crawl unrelated assets because visibility depends
on the user's Telegram session.

## Acceptance Checks

- No username sale reaches an estimate without a finalized event, positive
  GRAM price, and sale-time USD rate.
- A market worker rate limit only defers the cursor; it does not erase prepared
  valuations or downgrade existing portfolio values.
- A wallet import has at most one compact D1 lookup plus an optional background
  alias enqueue.
- Every prepared valuation records estimator version, confidence, evidence
  count, comparable evidence, and a finite staleness time.
