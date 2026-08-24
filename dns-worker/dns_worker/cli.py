"""Command-line entry point for the TON DNS market sidecar."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from .config import Settings
from .d1_client import D1IdentityClient
from .direct_d1 import DirectD1Ingestor, SUPPORTED_DIRECT_STREAMS
from .logging_utils import configure_logging
from .parquet_reader import DnsParquetReader
from .runner import MarketIngestRunner, source_proof
from .s3_source import S3Source
from .store import PostgresStore


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="tontrack-dns-market")
    commands = root.add_subparsers(dest="command", required=True)

    discover = commands.add_parser("discover", help="discover S3 objects into durable jobs")
    discover.add_argument("--full-reconcile", action="store_true")
    discover.add_argument("--max-pages", type=int)

    commands.add_parser("ingest-once", help="claim and ingest one bounded batch")
    commands.add_parser("migrate", help="apply sidecar-owned source coordination schema")
    commands.add_parser("schema-check", help="verify the shared PostgreSQL contract")

    run = commands.add_parser("run", help="continuous discovery and ingestion")
    run.add_argument("--poll-seconds", type=float, default=15.0)
    run.add_argument("--discover-every-seconds", type=float, default=900.0)

    commands.add_parser("status", help="print durable queue and watermark status")
    direct = commands.add_parser(
        "direct-d1-once", help="ingest one bounded TON Lake page into compact D1"
    )
    direct.add_argument("--stream", choices=SUPPORTED_DIRECT_STREAMS, default="nft_events")
    direct.add_argument("--page-size", type=int, default=4)
    cycle = commands.add_parser(
        "direct-d1-cycle", help="advance one dependency-safe compact D1 ingestion page"
    )
    cycle.add_argument("--page-size", type=int, default=25)
    skip = commands.add_parser(
        "skip-domain", help="explicitly waive one unresolved catalog member"
    )
    skip.add_argument("--nft-address", required=True)
    skip.add_argument("--reason", required=True)

    proof = commands.add_parser("source-proof", help="read one source object without writes")
    proof.add_argument("--object-key", required=True)
    proof.add_argument("--sample-limit", type=int, default=20)
    proof.add_argument(
        "--stream", choices=("nft_items", "nft_metadata", "nft_events", "nft_sales"),
        default="nft_events",
    )
    proof.add_argument("--membership-file", type=Path)

    dry_run = commands.add_parser("dry-run", help="discover and normalize without writes")
    dry_run.add_argument("--object-key", required=True)
    dry_run.add_argument("--sample-limit", type=int, default=5)
    dry_run.add_argument(
        "--stream", choices=("nft_items", "nft_metadata", "nft_events", "nft_sales"),
        default="nft_events",
    )
    dry_run.add_argument("--membership-file", type=Path)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    require_database = args.command not in {
        "source-proof", "dry-run", "direct-d1-once", "direct-d1-cycle"
    }
    try:
        settings = Settings.from_env(require_database=require_database)
    except (ValueError, TypeError) as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2
    configure_logging(settings.log_level)
    if args.command in {"direct-d1-once", "direct-d1-cycle"}:
        configured_page_cap = max(0, int(os.getenv("DNS_DIRECT_MAX_PAGE_SIZE", "0") or 0))
        page_size = max(1, args.page_size)
        if configured_page_cap:
            page_size = min(page_size, configured_page_cap)
        client = D1IdentityClient(
            os.getenv("D1_REGISTRY_URL", "")
            or os.getenv("VALUATION_READ_MODEL_URL", ""),
            os.getenv("D1_INGEST_SECRET", ""),
            timeout_seconds=settings.http_timeout_seconds,
        )
        ingestor = DirectD1Ingestor(settings, client)
        output = ingestor.run_cycle(page_size=page_size) \
            if args.command == "direct-d1-cycle" else ingestor.run_once(
                stream=args.stream, page_size=page_size
            )
        print(json.dumps(output, sort_keys=True))
        return 0
    if args.command in {"source-proof", "dry-run"}:
        source = S3Source(
            settings.bucket_url,
            settings.source_prefixes[args.stream],
            timeout_seconds=settings.http_timeout_seconds,
            backoff_seconds=settings.backoff_seconds,
        )
        output = source_proof(
            settings,
            source,
            DnsParquetReader(
                memory_limit=settings.duckdb_memory_limit,
                threads=settings.duckdb_threads,
            ),
            args.object_key,
            args.sample_limit,
            stream=args.stream,
            membership_path=args.membership_file,
        )
        print(json.dumps(output, indent=2, sort_keys=True))
        return 0

    assert settings.database_url
    store = PostgresStore(settings.database_url)
    if args.command == "migrate":
        store.verify_shared_schema()
        directory = Path(__file__).resolve().parents[1] / "sql"
        print(json.dumps({"applied": store.apply_sidecar_migrations(directory)}))
        return 0
    if args.command == "schema-check":
        store.verify_shared_schema()
        print(json.dumps({"compatible": True}, sort_keys=True))
        return 0
    store.verify_shared_schema()
    if args.command == "run":
        directory = Path(__file__).resolve().parents[1] / "sql"
        applied = store.apply_sidecar_migrations(directory)
        logging.getLogger(__name__).info(
            "sidecar migrations ready applied=%s", applied
        )
    if args.command == "skip-domain":
        print(
            json.dumps(
                store.skip_domain(args.nft_address, args.reason), sort_keys=True
            )
        )
        return 0
    # Do not inject the event source here: the runner must select the matching
    # S3 prefix independently for items, metadata, events, and sales.
    runner = MarketIngestRunner(settings, store)
    if args.command == "discover":
        count = runner.discover(args.full_reconcile, args.max_pages)
        print(json.dumps({"discovered": count}, sort_keys=True))
        return 0
    if args.command == "ingest-once":
        print(json.dumps(runner.process_batch(), sort_keys=True))
        return 0
    if args.command == "status":
        print(json.dumps(store.status(), indent=2, sort_keys=True))
        return 0
    if args.command == "run":
        runner.run_continuous(args.poll_seconds, args.discover_every_seconds)
        return 0
    logging.getLogger(__name__).error("unhandled command: %s", args.command)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
