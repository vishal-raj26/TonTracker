from __future__ import annotations

import duckdb

from dns_worker.constants import TON_DNS_COLLECTION
from dns_worker.parquet_reader import DnsParquetReader


def test_reader_filters_collection_and_projects_expected_fields(tmp_path):
    source = tmp_path / "extensionless-object"
    connection = duckdb.connect()
    connection.execute(
        """
        CREATE TABLE events AS SELECT * FROM (VALUES
            ('sale', 'dns-nft', '1', ?, 'owner', '{"domain":"proof"}',
             1733093300::BIGINT, 0::BIGINT, NULL::VARCHAR, NULL::VARCHAR,
             NULL::VARCHAR, NULL::VARCHAR, 'auction', 1733093300::BIGINT,
             ?, '983557200', 'TON', '983557200', NULL::VARCHAR, NULL::VARCHAR),
            ('sale', 'other-nft', '2', '0:OTHER', 'owner', '{"domain":"other"}',
             1733093301::BIGINT, 1::BIGINT, 'tx', 'trace', NULL::VARCHAR,
             'contract', 'sale', NULL::BIGINT, 'market', '1000', 'TON',
             NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR)
        ) AS t(type,nft_item_address,nft_item_index,collection_address,owner_address,
               content_onchain,timestamp,lt,tx_hash,trace_id,prev_owner,sale_contract,
               sale_type,sale_end_time,marketplace_address,sale_price,payment_asset,
               auction_max_bid,auction_min_bid,auction_min_step)
        """,
        [TON_DNS_COLLECTION, TON_DNS_COLLECTION],
    )
    escaped_path = str(source).replace("'", "''")
    connection.execute(f"COPY events TO '{escaped_path}' (FORMAT PARQUET)")
    connection.close()

    rows = list(DnsParquetReader(row_batch_size=1).iter_rows(source))

    assert len(rows) == 1
    assert rows[0]["nft_item_address"] == "dns-nft"
    assert set(rows[0]) >= {"sale_price", "marketplace_address", "content_onchain"}


def test_items_bootstrap_is_exact_and_canonical(tmp_path):
    source = tmp_path / "items"
    connection = duckdb.connect()
    connection.execute(
        """
        CREATE TABLE items AS SELECT * FROM (VALUES
          ('0:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true,
           '7', ?, '0:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
           '{"domain":"Proof"}', 1700000000::INTEGER, 1::BIGINT),
          ('0:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', true,
           '8', '0:OTHER', NULL, '{}', 1700000001::INTEGER, 2::BIGINT)
        ) AS t(address,is_init,index,collection_address,owner_address,
               content_onchain,timestamp,lt)
        """,
        [TON_DNS_COLLECTION.upper()],
    )
    escaped = str(source).replace("'", "''")
    connection.execute(f"COPY items TO '{escaped}' (FORMAT PARQUET)")
    connection.close()

    rows = list(DnsParquetReader().iter_items(source, "x/date=2024-01-01/a"))
    assert len(rows) == 1
    assert rows[0].nft_address == "0:" + "a" * 64
    assert rows[0].collection_address == TON_DNS_COLLECTION
    assert rows[0].domain_normalized == "proof.ton"


def test_metadata_uses_disk_backed_membership_semijoin(tmp_path):
    source = tmp_path / "metadata"
    members = tmp_path / "members.csv"
    member = "0:" + "a" * 64
    members.write_text(member + "\n", encoding="ascii")
    connection = duckdb.connect()
    connection.execute(
        """
        CREATE TABLE metadata AS SELECT * FROM (VALUES
          ('item', ?, 1::INTEGER, 2::INTEGER, NULL::VARCHAR, '{}', 1::INTEGER,
           'Proof.ton', 'desc', 'image', NULL::VARCHAR, '[]',
           {'name':'tonapi','description':'tonapi','image':'tonapi','image_data':'','attributes':'tonapi'},
           'cache'),
          ('item', '0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
           1::INTEGER, 2::INTEGER, NULL::VARCHAR, '{}', 1::INTEGER, 'Other.ton',
           'desc', 'image', NULL::VARCHAR, '[]',
           {'name':'tonapi','description':'tonapi','image':'tonapi','image_data':'','attributes':'tonapi'},
           'cache')
        ) AS t(type,address,update_time_onchain,update_time_metadata,parent_address,
               content_onchain,metadata_status,name,description,image,image_data,
               attributes,sources,tonapi_image_url)
        """,
        [member],
    )
    escaped = str(source).replace("'", "''")
    connection.execute(f"COPY metadata TO '{escaped}' (FORMAT PARQUET)")
    connection.close()

    rows = list(DnsParquetReader().iter_metadata(source, "x/date=2024-01-01/a", members))
    assert [row.nft_address for row in rows] == [member]
    assert rows[0].domain_normalized == "proof.ton"


def test_sales_projects_membership_and_emits_state_before_bid(tmp_path):
    source = tmp_path / "sales"
    members = tmp_path / "members.csv"
    nft = "0:" + "a" * 64
    owner = "0:" + "b" * 64
    bidder = "0:" + "c" * 64
    contract = "0:" + "d" * 64
    marketplace = "0:" + "e" * 64
    members.write_text(nft + "\n", encoding="ascii")
    connection = duckdb.connect()
    connection.execute(
        """
        CREATE TABLE sales AS SELECT * FROM (VALUES
          (?, 'auction', ?, ?, 1700000000::BIGINT, false, false,
           1700001000::BIGINT, ?, NULL::VARCHAR, NULL::VARCHAR,
           '1000000000', 'TON', NULL::VARCHAR, NULL::VARCHAR,
           '2000000000', '1000000000', '100000000', 1700000100::BIGINT,
           ?, 1700000200::BIGINT, 9::BIGINT)
        ) AS t(address,type,nft_address,nft_owner_address,created_at,is_complete,
               is_canceled,end_time,marketplace_address,marketplace_fee_address,
               marketplace_fee,price,asset,royalty_address,royalty_amount,max_bid,
               min_bid,min_step,last_bid_at,last_member,timestamp,lt)
        """,
        [contract, nft, owner, marketplace, bidder],
    )
    escaped = str(source).replace("'", "''")
    connection.execute(f"COPY sales TO '{escaped}' (FORMAT PARQUET)")
    connection.close()

    rows = list(DnsParquetReader().iter_sales(source, "x/date=2024-01-01/a", members))

    assert [row["type"] for row in rows] == ["put_on_sale", "bid"]
    assert rows[0]["sale_price"] == "1000000000"
    assert rows[1]["sale_price"] == "2000000000"
    assert rows[1]["prev_owner"] == bidder
