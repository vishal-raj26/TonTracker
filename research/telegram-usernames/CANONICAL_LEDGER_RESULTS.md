# Canonical Telegram Username Ledger Results

Inventory: **621,263** verified items.
Analyzed sale rows: **340,000** from 2022-11-02 through 2025-07-20.

> The row-level sale export is partial because the Dune account hit its result-download quota. All numbers below are explicitly limited to the covered interval; they are not represented as full-market totals.

## Inventory

- Currently listed: **18,100** (2.9%).
- All-letter names: **69.7%**.
- Names containing digits: **20.7%**.
- Names containing underscores: **11.7%**.

## Sale structure

- **primary**: 278,583 rows, 278,583 items, median $37.97.
- **secondary**: 61,417 rows, 44,712 items, median $24.13.
- Repeat-sale items: **43,524**.
- Self-sale rows: **0**.
- Buyer/seller pairs with over 10 sales: **191**.

## Repeat-sale backtest

Out-of-time test rows: **11,050**, starting 2025-06-04.

| Baseline | Median error factor | Within 2x | Within 5x |
|---|---:|---:|---:|
| Unchanged prior sale | 1.34x | 87.2% | 96.1% |
| Prior sale + trailing market regime | 1.35x | 87.9% | 96.1% |

A prior sale is useful evidence, but it is neither a current floor nor a complete valuation. The production model must decay it, adjust for market regime, and combine it with current bids, listings, comparables, and name quality.
