"""CLI entry point."""

from __future__ import annotations

import argparse
import logging
from dataclasses import replace

from .config import Settings
from .worker import SemanticWorker


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Process queued TON DNS semantic-enrichment jobs."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Claim and process one bounded batch, then exit.",
    )
    return parser.parse_args()


def main() -> None:
    arguments = _arguments()
    settings = Settings.from_env()
    if arguments.once:
        settings = replace(settings, run_once=True)
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    SemanticWorker.from_settings(settings).run()


if __name__ == "__main__":
    main()
