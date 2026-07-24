-- TonTrack gift model stats for Dune.
--
-- Expected output columns used by server.js:
-- collection, model, model_count, model_supply_pct,
-- holder_count, transfer_count_7d, transfer_count_30d, upgraded_count
--
-- Notes:
-- - Dune's TON catalog exposes NFT metadata and NFT events for on-chain/upgraded NFTs.
-- - If your Dune workspace names the metadata table differently, use the NFT metadata
--   table/view that has: type, address, parent_address, name, attributes.
-- - This measures upgraded/on-chain gift NFTs. It does not count Telegram-only gifts that
--   have not been minted/upgraded on-chain.

WITH nft_items AS (
  SELECT
    item.address AS nft_item_address,
    item.parent_address AS collection_address,
    COALESCE(collection.name, regexp_replace(item.name, '\\s*#\\d+$', '')) AS collection,
    item.name AS nft_name,
    max(CASE
      WHEN lower(json_extract_scalar(attribute, '$.trait_type')) = 'model'
        OR lower(json_extract_scalar(attribute, '$.type')) = 'model'
        OR lower(json_extract_scalar(attribute, '$.label')) = 'model'
      THEN json_extract_scalar(attribute, '$.value')
    END) AS model
  FROM ton.nft_metadata item
  LEFT JOIN ton.nft_metadata collection
    ON collection.type = 'collection'
   AND collection.address = item.parent_address
  CROSS JOIN UNNEST(CAST(json_parse(item.attributes) AS ARRAY(JSON))) AS traits(attribute)
  WHERE item.type = 'item'
    AND item.attributes IS NOT NULL
  GROUP BY 1, 2, 3, 4
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
event_counts AS (
  SELECT
    nft_item_address,
    count_if(timestamp >= now() - INTERVAL '7' day) AS transfer_count_7d,
    count_if(timestamp >= now() - INTERVAL '30' day) AS transfer_count_30d
  FROM ton.nft_events
  WHERE type IN ('transfer', 'sale', 'auction_sale', 'mint')
  GROUP BY 1
),
model_rows AS (
  SELECT
    item.collection_address,
    item.collection,
    item.model,
    count(*) AS model_count,
    count(DISTINCT owner.owner_address) AS holder_count,
    sum(COALESCE(events.transfer_count_7d, 0)) AS transfer_count_7d,
    sum(COALESCE(events.transfer_count_30d, 0)) AS transfer_count_30d,
    count(*) AS upgraded_count
  FROM nft_items item
  LEFT JOIN latest_owner owner
    ON owner.nft_item_address = item.nft_item_address
  LEFT JOIN event_counts events
    ON events.nft_item_address = item.nft_item_address
  WHERE item.model IS NOT NULL
  GROUP BY 1, 2, 3
)
SELECT
  collection,
  model,
  model_count,
  round(100.0 * model_count / nullif(sum(model_count) OVER (PARTITION BY collection_address), 0), 4) AS model_supply_pct,
  holder_count,
  transfer_count_7d,
  transfer_count_30d,
  upgraded_count
FROM model_rows
ORDER BY collection, model;
