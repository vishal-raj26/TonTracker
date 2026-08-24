from __future__ import annotations

from dataclasses import replace

from dns_worker.config import Settings
from dns_worker.models import ClaimedJob, SourceObject
from dns_worker.runner import MarketIngestRunner


class FakeStore:
    def __init__(self, jobs=None, state=(None, False)):
        self.jobs = list(jobs or [])
        self.state = state
        self.cursors = []
        self.failures = []
        self.completed = []

    def discovery_state(self, stream):
        return self.state

    def enqueue_objects(self, stream, objects):
        return len(objects)

    def save_discovery_cursor(self, stream, key, scan_complete=False):
        self.cursors.append((stream, key, scan_complete))

    def heartbeat(self, *_):
        return None

    def recover_expired_leases(self):
        return 0

    def claim_jobs(self, *_):
        result, self.jobs = self.jobs, []
        return result

    def complete_job(self, job, payload):
        self.completed.append((job, payload))
        return replace(
            payload.stats,
            inserted_rows=len(payload.events),
            updated_domains=len(payload.catalog_items) + len(payload.metadata_records),
        )

    def fail_job(self, job, error, max_attempts, delay_seconds):
        status = "poison" if job.attempts >= max_attempts else "retry"
        self.failures.append((job.object_key, status, error, delay_seconds))
        return status


class FakeSource:
    def __init__(self, pages=None):
        self.pages = pages or []
        self.start_after = None

    def iter_pages(self, **kwargs):
        self.start_after = kwargs["start_after"]
        yield from self.pages

    def download(self, item, destination):
        destination.write_bytes(b"fixture")
        return destination


class FailingReader:
    def iter_rows(self, path):
        raise RuntimeError("broken parquet")
        yield  # pragma: no cover


class StreamAwareSource(FakeSource):
    def __init__(self, stream):
        super().__init__(pages=[])
        self.stream = stream


class StreamAwareRunner(MarketIngestRunner):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.requested_streams = []

    def _source(self, stream):
        self.requested_streams.append(stream)
        return StreamAwareSource(stream)


def settings(tmp_path):
    return Settings(
        database_url="postgresql://unused",
        bucket_url="https://bucket",
        source_prefixes={
            "nft_items": "v1.1/ton/nft_items/",
            "nft_metadata": "v1.1/ton/nft_metadata/",
            "nft_events": "v1.1/ton/nft_events/",
            "nft_sales": "v1.1/ton/nft_sales/",
        },
        start_date=None,
        end_date=None,
        batch_size=8,
        max_attempts=3,
        lease_seconds=60,
        backoff_seconds=1,
        http_timeout_seconds=10,
        temp_dir=str(tmp_path),
        max_events_per_object=100,
        max_object_bytes=1_000_000,
        duckdb_memory_limit="128MB",
        duckdb_threads=1,
        log_level="INFO",
        worker_id="test-worker",
    )


def test_discovery_resumes_incomplete_scan_from_exact_cursor(tmp_path):
    store = FakeStore(state=("v1.1/ton/nft_events/date=2024-12-01/a", False))
    source = FakeSource(
        pages=[
            ([SourceObject("v1.1/ton/nft_events/date=2024-12-01/b")], "b"),
        ]
    )
    runner = MarketIngestRunner(settings(tmp_path), store, source=source)
    assert runner.discover(streams=("nft_events",)) == 1
    assert source.start_after.endswith("/a")
    assert store.cursors[-1] == ("nft_events", "b", True)


def test_discovery_replays_latest_partition_after_completed_scan(tmp_path):
    cursor = "v1.1/ton/nft_events/date=2024-12-01/zzz"
    store = FakeStore(state=(cursor, True))
    source = FakeSource(pages=[])
    runner = MarketIngestRunner(settings(tmp_path), store, source=source)
    runner.discover(streams=("nft_events",))
    assert source.start_after == "v1.1/ton/nft_events/date=2024-12-01/"


def test_discovery_marks_empty_stream_complete(tmp_path):
    store = FakeStore()
    runner = MarketIngestRunner(settings(tmp_path), store, source=FakeSource(pages=[]))

    assert runner.discover(streams=("nft_items",)) == 0
    assert store.cursors[-1] == ("nft_items", None, True)


def test_default_runner_routes_every_stream_to_its_own_source(tmp_path):
    store = FakeStore()
    runner = StreamAwareRunner(settings(tmp_path), store)

    runner.discover()

    assert runner.requested_streams == [
        "nft_items", "nft_metadata", "nft_events", "nft_sales"
    ]


def test_failed_jobs_retry_then_poison_without_blocking_batch(tmp_path):
    jobs = [
        ClaimedJob("nft_events", "v1.1/ton/nft_events/date=2024-12-01/a", "2024-12-01", 1),
        ClaimedJob("nft_events", "v1.1/ton/nft_events/date=2024-12-01/b", "2024-12-01", 3),
    ]
    store = FakeStore(jobs=jobs)
    runner = MarketIngestRunner(
        settings(tmp_path), store, source=FakeSource(), reader=FailingReader()
    )
    result = runner.process_batch()
    assert result["retry"] == 1
    assert result["poison"] == 1
    assert [failure[1] for failure in store.failures] == ["retry", "poison"]
