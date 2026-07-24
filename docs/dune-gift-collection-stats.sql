-- TonTrack gift collection stats for Dune.
--
-- Expected output columns used by server.js:
-- collection,
-- price_usd or mint_price_usd,
-- current_supply or upgraded_supply,
-- initial_supply or total_minted,
-- max_supply,
-- burned_count,
-- onchain_holders, tg_holders, total_minted
--
-- Notes:
-- - Query 5254340 already exposes collection, price_usd, initial_supply,
--   current_supply, max_supply, and burned percentage.
-- - TonTrack maps:
--   price_usd -> mint price
--   current_supply -> upgraded/on-chain supply
--   max_supply - current_supply -> unupgraded/not-yet-upgraded supply
--   initial_supply - max_supply -> total burned
--   initial_supply -> total minted
-- - Holder counts require a heavier owner rollup over ton.nft_events and may hit Dune
--   rate/compute limits on the free plan. Keep holders NULL unless a saved query returns
--   onchain_holders / tg_holders directly.

WITH nft_items AS (
  SELECT
    item.address AS nft_item_address,
    item.parent_address AS collection_address,
    COALESCE(collection.name, regexp_replace(item.name, '\\s*#\\d+$', '')) AS collection
  FROM ton.nft_metadata item
  LEFT JOIN ton.nft_metadata collection
    ON collection.type = 'collection'
   AND collection.address = item.parent_address
  WHERE item.type = 'item'
),
latest_owner AS (
  SELECT nft_item_address, owner_address
  FROM (
    SELECT
      nft_item_address,
      owner_address,
      row_number() OVER (
        PARTITION BY nft_item_address
        ORDER BY timestamp DESC, lt DESC
      ) AS rn
    FROM ton.nft_events
    WHERE owner_address IS NOT NULL
  )
  WHERE rn = 1
),
burned_items AS (
  SELECT DISTINCT nft_item_address
  FROM ton.nft_events
  WHERE lower(type) IN ('burn', 'burned')
),
onchain_collection_rows AS (
  SELECT
    item.collection_address,
    item.collection,
    count(*) AS upgraded_supply,
    count(DISTINCT owner.owner_address) AS onchain_holders,
    count(DISTINCT burned.nft_item_address) AS burned_count
  FROM nft_items item
  LEFT JOIN latest_owner owner
    ON owner.nft_item_address = item.nft_item_address
  LEFT JOIN burned_items burned
    ON burned.nft_item_address = item.nft_item_address
  GROUP BY 1, 2
),
telegram_gift_catalog AS (
  -- Replace this placeholder with your Dune source for official Telegram gift issuance.
  -- Required columns:
  -- collection, mint_price_stars, mint_price_ton, mint_price_usd,
  -- total_minted, unupgraded_supply, tg_holders
  SELECT
    CAST(NULL AS varchar) AS collection,
    CAST(NULL AS double) AS mint_price_stars,
    CAST(NULL AS double) AS mint_price_ton,
    CAST(NULL AS double) AS mint_price_usd,
    CAST(NULL AS bigint) AS total_minted,
    CAST(NULL AS bigint) AS unupgraded_supply,
    CAST(NULL AS bigint) AS tg_holders
  WHERE false
)
SELECT
  COALESCE(catalog.collection, onchain.collection) AS collection,
  catalog.mint_price_stars,
  catalog.mint_price_ton,
  catalog.mint_price_usd,
  onchain.upgraded_supply,
  catalog.unupgraded_supply,
  onchain.burned_count,
  onchain.onchain_holders,
  catalog.tg_holders,
  catalog.total_minted
FROM onchain_collection_rows onchain
FULL OUTER JOIN telegram_gift_catalog catalog
  ON lower(regexp_replace(catalog.collection, '[^a-zA-Z0-9]+', '')) =
     lower(regexp_replace(onchain.collection, '[^a-zA-Z0-9]+', ''))
WHERE COALESCE(catalog.collection, onchain.collection) IS NOT NULL
ORDER BY collection;
