# Telegram Username Clean-Room Research

This directory contains collectors and reproducible experiments used by the 2026 Telegram collectible
username valuation study. It is deliberately separate from application runtime code.

## Reproduce

Install the isolated research dependencies:

```powershell
python -m pip install -r research\telegram-usernames\requirements-research.txt
```

Run the local analyses after the source datasets are present:

```powershell
python research\telegram-usernames\analyze_username_market.py
python research\telegram-usernames\analyze_canonical_ledger.py
python research\telegram-usernames\analyze_username_dns_inventory.py
python research\telegram-usernames\analyze_username_dns_sales.py
```

Collectors:

```powershell
python research\telegram-usernames\collect_tonapi_universe.py
python research\telegram-usernames\collect_tonapi_dns_universe.py
python research\telegram-usernames\collect_dune_market_ledger.py event_counts
python research\telegram-usernames\collect_dune_market_ledger.py monthly
python research\telegram-usernames\collect_dune_market_ledger.py marketplaces
python research\telegram-usernames\collect_dune_market_ledger.py username_dns_pairs
```

`DUNE_API_KEY` is read from the environment or the repository `.env`. Large raw exports and inventory
snapshots are gitignored. Generated summary JSON and Markdown reports remain small enough to review.

## Reports

- `EXPERIMENT_RESULTS.md`: selected-sale chronological cold-start baselines.
- `CANONICAL_LEDGER_RESULTS.md`: canonical ledger and repeat-sale analysis.
- `USERNAME_DNS_INVENTORY_RESULTS.md`: exact-name inventory and ask diagnostics.
- `USERNAME_DNS_SALES_RESULTS.md`: canonical matched secondary-sale relationship.

## Important limitations

- The 340,000-row canonical username export is partial because the research Dune account reached its
  result-download quota. Full aggregate counts were queried independently.
- The public sale sample is selected and cannot be treated as a market-random dataset.
- Active asks are censored seller intent, not fair-value labels.
- The matched username/DNS sample is thin in short and mixed-name segments.
- The current manipulation analysis is a baseline; production needs graph-based wallet clustering.

