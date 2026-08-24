from __future__ import annotations

from datetime import date
from email.message import Message
from io import BytesIO

from dns_worker.s3_source import S3Source, parse_list_objects_v2, partition_date_from_key


def page(keys, truncated=False, token=None):
    contents = "".join(
        f"""
        <Contents><Key>{key}</Key><LastModified>2026-08-13T00:00:00Z</LastModified>
        <ETag>&quot;etag-{index}&quot;</ETag><Size>{index + 10}</Size></Contents>
        """
        for index, key in enumerate(keys)
    )
    token_xml = f"<NextContinuationToken>{token}</NextContinuationToken>" if token else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
    <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <IsTruncated>{str(truncated).lower()}</IsTruncated>{token_xml}{contents}
    </ListBucketResult>""".encode()


class Response(BytesIO):
    def __init__(self, body):
        super().__init__(body)
        self.headers = Message()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def test_parse_list_objects_v2():
    objects, truncated, token = parse_list_objects_v2(
        page(["v1.1/ton/nft_events/date=2024-12-01/abc"], True, "next-token")
    )
    assert truncated is True
    assert token == "next-token"
    assert objects[0].partition == "2024-12-01"
    assert objects[0].etag == "etag-0"
    assert objects[0].size_bytes == 10


def test_iter_pages_paginates_filters_and_passes_start_after():
    responses = [
        page(
            [
                "v1.1/ton/nft_events/date=2024-11-30/old",
                "v1.1/ton/nft_events/date=2024-12-01/a",
            ],
            True,
            "opaque+/token=",
        ),
        page(["v1.1/ton/nft_events/date=2024-12-02/b"]),
    ]
    urls = []

    def opener(request, timeout):
        urls.append(request.full_url)
        return Response(responses.pop(0))

    source = S3Source("https://bucket.example", "v1.1/ton/nft_events/", opener=opener)
    pages = list(
        source.iter_pages(
            start_date=date(2024, 12, 1),
            end_date=date(2024, 12, 2),
            start_after="v1.1/ton/nft_events/date=2024-11-30/",
        )
    )

    assert [[item.key for item in items] for items, _ in pages] == [
        ["v1.1/ton/nft_events/date=2024-12-01/a"],
        ["v1.1/ton/nft_events/date=2024-12-02/b"],
    ]
    assert "start-after=" in urls[0]
    assert "continuation-token=opaque%2B%2Ftoken%3D" in urls[1]


def test_partition_date_is_strict():
    assert partition_date_from_key("x/date=2026-08-13/y") == date(2026, 8, 13)
    assert partition_date_from_key("x/date=not-a-date/y") is None
    assert partition_date_from_key("x/no-partition") is None
