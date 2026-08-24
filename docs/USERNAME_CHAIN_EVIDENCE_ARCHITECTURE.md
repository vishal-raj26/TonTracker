# Telegram Username Chain Evidence

## Purpose

The username estimator uses a compact D1 ledger for the request path. It must
show prepared values immediately when one exists, while retaining enough
evidence to verify a discovered sale without copying raw marketplace pages.

## Evidence Rules

1. Fragment public completed-sale pages discover market events.
2. Historical USD is calculated from the GRAM/USD rate at the event timestamp.
3. A TON Center check is **additive**. It marks an event chain-confirmed only
   when the real collectible item address, exact native amount, and timestamp
   match the discovered Fragment sale.
4. An NFT transfer by itself is never a sale and never becomes valuation input.
5. TON Center timeouts, rate limits, or unavailable aliases cannot discard a
   completed Fragment record or stall the persisted market cursor.

## Compact Data Flow

```text
public Fragment completed-sales evidence -> historical GRAM/USD -> identity_sales (D1)
wallet import real NFT item -> identity_asset_aliases (D1)
identity aliases + bounded TON Center checks -> optional chain proof tier in sale metadata
sales -> prepared own-sale values + archetype baselines -> valuation_records
wallet import -> one D1 batch valuation lookup by NFT address and username
```

`identity_asset_aliases` stores only `asset kind`, real item address, normalized
name, canonical catalog key, source, and timestamps. It holds no raw pages,
sale payloads, wallets, or private Telegram data. Entries expire after 90 days.

## Runtime Settings

```env
USERNAME_TONCENTER_VERIFY_ENABLED=1 # default; set 0 only to opt out
USERNAME_TONCENTER_VERIFY_BATCH_SIZE=2
USERNAME_TONCENTER_BASE_URL=https://toncenter.com/api/v3
USERNAME_TONCENTER_API_KEY=
USERNAME_FIRST_IMPORT_EVIDENCE_LIMIT=12
USERNAME_FIRST_IMPORT_EVIDENCE_TIMEOUT_MS=55000
USERNAME_FIRST_IMPORT_FRAGMENT_DELAY_MS=1500
```

Without a TON Center key the verifier paces itself at roughly one request per
second. It also accepts a bounded seller-net-proceeds amount when a Fragment
gross sale price has marketplace fees deducted, and records that deviation.
The batch size remains low so discovery keeps advancing. An API key raises
capacity but does not change the proof rule.

## Deployment Order

1. Apply `cloudflare/valuation-read-model-migrations/0001_identity_asset_aliases.sql`
   to the `VALUATION_READ_MODEL` D1 binding.
2. Deploy the Worker containing the alias endpoints.
3. Deploy the app/runtime change so wallet imports register aliases.
4. Enable `USERNAME_TONCENTER_VERIFY_ENABLED=1` for the username-ledger worker.
5. Run the ledger through a normal complete cycle; existing sale IDs are
   idempotent and chain metadata is enriched when evidence is available.

## Wallet-priority evidence

The market crawler is deliberately broad, slow, and resumable. It must not be
the only way a newly connected wallet discovers evidence about usernames it
already owns.

When an import contains a username without a current prepared valuation, the
runtime performs a bounded, public, exact-asset check before falling back to
the normal prepared read model:

1. It opens the public Fragment page for the specific username.
2. It verifies each reported sale against the imported NFT's own TON Center
   settlement; it does not rely on the page's current owner as an identity
   substitute.
3. It obtains the GRAM/USD rate at the sale time and writes only passing rows
   to the compact valuation ledger.
4. It re-reads the prepared valuation and returns it in the same import
   response.

The default is at most 12 assets and a 55-second total budget. Requests are
paced at 1.5 seconds, and assets not reached before the budget expires remain
eligible for a later refresh rather than being marked as failed. In-memory
attempt suppression prevents the same server instance from repeating this work
for six hours. The resulting sale records are idempotent by immutable sale ID,
so later import checks and the background crawler safely converge.

The D1 storage guard reconciles `tracked_sales` with the actual
`identity_sales` row count before and after each sale batch. An evidence retry
or metadata upgrade therefore cannot consume quota or make storage pressure
appear larger than the database really is.

This mechanism never reads Telegram group posts, copied cookies, a user's
Mini App credentials, or private chats. `npm run audit:usernames` exercises the
same public page-to-settlement join without writing to any database.

The estimator does not use asks, bids, failed auctions, or buyer/seller
concentration as a portfolio-price substitute. Those are not required to make
a past completed sale valid.
