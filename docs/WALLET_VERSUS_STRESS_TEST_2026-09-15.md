# Wallet Versus: worked proposal and selection verdict

Research date: 15 September 2026. Status: REJECT AS LEAD; retain as a practical adaptation reserve. This supersedes V5's recommendation to prioritize a Versus visual prototype. No trade, submission or app configuration change was made.

## Decision

Pairs trading could be a useful addition to Wallet, but the proposed combination of two legs, combined P&L, funding, risk controls and coordinated closing is already documented by Pear. Those are not distinctive inventions. Adapting a proven feature is allowed by our brief; nevertheless, this particular adaptation has insufficient demonstrated user demand and implementation advantage to lead an originality-sensitive contest entry. Do not spend on polished mockups now.

The strongest honest positioning is “a guided relative-performance workflow inside Wallet,” not “a new way to trade that nobody offers.” There is no evidence that this is Wallet's highest-priority missing feature.

## Verified comparison

| Capability | Wallet evidence | Pear evidence | Implication |
| --- | --- | --- | --- |
| Long/short derivatives | Documented | Documented | Not new |
| Two different assets managed as a strategy | Not established in inspected Wallet sources | Pairs/baskets on Lighter | Potential Wallet gap, established prior art |
| Combined performance and funding | No verified linked-pair view | FAQ explicitly describes both | Cannot claim as our differentiator |
| Strategy-level controls and close | No verified linked-pair controls | Documented basket controls and closing | Established prior art |
| Margin protection | Wallet documents isolated margin | Different account/custody model | A shared venue does not make integration a drop-in |

Sources: [Wallet trading guide](https://help.wallet.tg/article/634-trade-and-trading-assets-in-wallet), [Pear FAQ](https://docs.pear.garden/resources/faqs), [Pear Lighter connector](https://docs.pear.garden/venues-and-markets/lighter), [position management](https://docs.pear.garden/api-integration/executing-trade/managing-open-position).

Wallet's September 14 position-resizing announcement was also visible in the live channel. Resizing must not be proposed as a new standalone feature. [Announcement](https://t.me/cryptowallet_news_en/844).

“Not established” is not proof of absence across every region/account. This round inspected official trading documentation and the Telegram channel/comments, not a newly accessible live perpetuals screen.

## Concrete product proposal

Working name: **Wallet Versus**. Hook: **Trade which asset does better.**

Target user: an eligible, derivatives-experienced Wallet trader with a relative view, such as “BTC will perform better than ETH,” who otherwise has to coordinate two orders and their accounting. It is not a beginner savings product or an invitation to gamble on rivalry.

User problem hypothesis: entering, monitoring and exiting two related positions separately increases sizing mistakes, hidden costs and accidentally retained exposure. This is plausible, not yet validated with Wallet users.

### Smallest useful screen flow

1. **Choose a view.** Within Perpetuals, select Versus, choose two eligible contracts, then select which should outperform. Start with one approved liquid pair on one venue; BTC/ETH is illustrative until account-specific availability and liquidity are checked. Explain long A/short B explicitly. Do not imply ownership of either asset.
2. **Set exposure.** Enter equal initial dollar notional per leg, with each leg's collateral displayed separately. Clearly distinguish total gross exposure from funds committed. Propose a conservative leverage ceiling subject to risk review; do not promise that low leverage eliminates liquidation. No automatic rebalance or margin transfer.
3. **Review before opening.** Show both executable quotes, timestamps, per-leg slippage bounds, entry fees, estimated exit costs, current signed funding rates and separate liquidation estimates. Display an adverse scenario as prominently as a favorable one. Unknown or stale quotes block opening rather than becoming invented zeros.
4. **Track one strategy, two risks.** Show realized/unrealized trading result, actual funding and fees without double counting; label estimated close proceeds separately. Keep each leg's health visible even when aggregate P&L is positive. Show actual filled sizes, not requested sizes.
5. **Close with confirmation.** A single request attempts to reduce both legs. Mark the strategy closed only after confirmed zero remaining exposure on both. Residual exposure remains prominent with a manual risk-reduction action. Never claim atomic execution or guaranteed exit prices.

### Illustrative economics, not live quotes

Assume $100 initial notional long A and $100 short B, linear contracts, unchanged quantities and neither leg liquidated. Gross exposure is $200; this is NOT a statement that only $100 collateral is required.

| A return | B return | Gross trading result |
| ---: | ---: | ---: |
| -5% | -15% | +$10 |
| +5% | +15% | -$10 |
| +10% | +10% | $0 |

Formula: initial notional per leg × (A return − B return). Fees, signed funding cash flows and execution differences then affect the result. Funding can turn a positive gross result into a loss. Equal initial dollar exposure is not beta neutrality, and exposure drifts as prices change.

Liquidation is path-dependent: one leg may fail before the end of the intended trade. Wallet's isolated-margin model means favorable performance elsewhere must not be presented as automatically supporting that leg. A final-return comparison alone cannot predict the realized strategy outcome.

### Execution and accounting requirements

- Recheck instrument identity, eligibility, trading hours, balances, minimum sizes and both quotes before accepting an order.
- Use durable strategy/order IDs and reconcile actual fills after timeouts. Do not resend blindly and double the exposure.
- If only one side fills, show “Incomplete strategy.” A bounded unwind attempt can be authorized in the original review, but cannot be guaranteed; residual exposure requires immediate visibility. Never automatically increase size or spend outside the user's authorization.
- If either leg is liquidated, closed externally or reduced by the venue, mark the intended relationship broken and reconcile the survivor. No automatic re-entry.
- Initially prohibit overlapping Versus strategies on the same contracts unless independent accounting and venue netting are validated. Preserve the ability to close/reduce existing positions.
- Distinguish actual fees/funding from estimates. Pear's closed-position API reports funding separately from its net trading P&L; integrations must check semantics rather than blindly sum labels. [Accounting reference](https://docs.pear.garden/api-integration/trade-activity/closed-position).
- A close trigger firing is not proof of a completed exit: Pear explicitly documents partial/failed exits leaving exposure after the trigger is spent. This is a failure mode to handle, not an originality claim. [Trigger lifecycle](https://docs.pear.garden/api-integration/executing-trade/managing-open-position/take-profit-stop-loss).

Exclude from MVP: baskets, cross-venue legs, AI picks, leaderboards, social copying, automatic leverage changes, automatic reinvestment and promises of protected returns.

## Contest-comment check

Opened the current Telegram Web channel and the comments attached to post 838. The channel displayed 408 comments. The loaded accessibility tree contained 232 message-group containers, including 45 blocks containing #WalletIdeas. These counts are UI structure/sample counts, not an assertion that 232 unique complete contest submissions were read.

A focused text scan for pair trading, relative performance, outperform, versus, hedge mode and combined P&L surfaced the adjacent “Hedge Mode & Independent Positions for Futures” entry, message 549696. Its central mechanism is independent positions and simultaneous long/short exposure on the SAME asset, rather than our TWO-asset relative view. It nevertheless overlaps in position management and combined risk/accounting. Do not borrow its wording. [Entry](https://t.me/wallet_news_en_chat/549696).

No exact two-asset Versus entry was identified in this loaded sample. This is NOT a full originality clearance: unloaded comments, images, synonyms and later submissions remain outside the check.

Two practical constraints were freshly visible:

- Admin reply 549750 says multiple entries are allowed, but only one will be considered and asks participants not to spam. We can develop five options; five posts should not be represented as five independent chances. [Admin reply](https://t.me/wallet_news_en_chat/549750).
- The composer says sending media is not allowed in the group. Do not prepare direct image attachments as an assured submission format. External links have not been verified as permitted. No restriction was bypassed.

## Score against the four criteria

Editorial scores out of five, not the team's scores or measured probabilities:

| Criterion | Score | Assessment |
| --- | ---: | --- |
| Depth | 4 | Specific flow, economics, failure modes and scope; no integration test |
| Value | 3 | Plausible reduction in coordination errors for a narrower trader segment; demand unmeasured |
| Originality | 2 | Established paired trading and management; Wallet-specific adaptation is the principal difference |
| Wallet fit | 3 | Extends derivatives, but custody, isolated margin and lifecycle integration are unresolved |

It does not pass all four strongly enough to be our lead. A catchy name does not resolve the originality or safety gaps.

## What would change the verdict?

Reconsider only if we establish a material advantage over manual two-leg trading that users understand and value, and demonstrate reliable partial-fill/exit handling in Wallet's architecture. A proposed small usability test would compare manual and grouped flows for sizing accuracy, comprehension of liquidation and detecting residual exposure. These tests have NOT been conducted; user adoption statistics from Pear do not substitute for them.

Keep this document as the completed evaluation. Do not automatically resurrect Versus or add more features just to defend it. Evaluate a different user need next; polished visual work should follow selection, not determine it.
