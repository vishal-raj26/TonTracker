# Wallet: fresh trend scan and five working directions

Date: 15 September 2026. Focus: March–September 2026, with older sources used only for prior art. This is product research, not financial advice. Five working concepts are not five submission-ready entries.

## Outcome

The most compelling fresh concept to prototype is **Wallet Versus**, a two-asset relative-performance trade. Its hook is easier to understand than Funding Control, and a live Lighter implementation exists elsewhere. Its mass adoption is NOT established. Keep Funding Control for its substantive trading utility; add Event Markets, Private Receive and Legacy Setup to the working pool for distinct use cases. Legacy Setup is a practical reserve candidate, not a claim of a newly viral market.

The research does not establish that any of these is Wallet's highest-priority roadmap feature. Exact contest duplication remains unverified beyond the earlier sample. No new live app or authenticated comment inspection occurred this round.

## Evidence that changed the shortlist

### Relative-performance trading: Pear / The Orchard

Pear documents live pairs and baskets on Lighter. Its connector uses IOC/market-style orders with synthesized controls; all legs must be on the same venue. This is a useful implementation precedent, not evidence that Wallet can integrate the service without architectural changes. [Lighter documentation](https://docs.pear.garden/venues-and-markets/lighter).

Queried the documented public totals API, read-only, on the research date:

| Connector | totalVolume | totalTrades | totalUsers |
| --- | ---: | ---: | ---: |
| lighter | 66,540,341.437256 | 60,208 | 107 |
| hyperliquid | 71,618,372.348741 | 77,161 | 312 |

These are provider API values in each connector scope, not independently reconstructed onchain metrics. Do not sum users across venues or interpret them as unique humans, retained users or all historical users across Pear versions. The documentation describes totalUsers as users who ever filled in the connector scope. Its illustrative response values were NOT used as real data. [Definitions](https://docs.pear.garden/api-integration/statistics), [Lighter endpoint](https://pro-gateway.pearprotocol.io/statistics/totals?connector=lighter), [Hyperliquid endpoint](https://pro-gateway.pearprotocol.io/statistics/totals?connector=hyperliquid).

Social evidence was much thinner than product evidence. An August 27 Reddit pair-screener discussion raises leg liquidity and execution issues; it does not validate Pear demand. [Discussion](https://www.reddit.com/r/algotrading/comments/1w06uxd/made_a_pairs_screener_for_us_equities_17_million/).

### Event markets: Limitless

June's official update documents user-generated markets and bundled predictions. It reports 162 beta creators and 1,611 markets, but also identifies and removes $2.7B in manufactured notional volume. Both are provider disclosures, not independently audited results. [June update](https://limitless.exchange/blog/the-huddle-issue-01-jun-30th).

A Reddit experience thread contains both interface praise and a complaint about difficulty obtaining fills. Treat those as anecdotal, not settled performance findings. [Discussion](https://www.reddit.com/r/PredictionsMarkets/comments/1sxe392/does_anyone_have_any_experience_with_limitless/).

### Private financial accounts: Fluidkey

Fluidkey combines receiving, banking, yield and stocks with stealth-address privacy. Its current website reports 28K+ users; transfer-volume banners are inconsistent ($1B+ and $900M+), so do not quote a precise volume. These are company-reported claims, not proof of retention. [Product site](https://www.fluidkey.com/).

The important mechanism is a fresh smart account for each incoming payment, managed through one interface. Its FAQ distinguishes unlinkability from traceability and explains that Fluidkey has viewing access. Combining or spending funds can reveal links to counterparties. This is not universal anonymity. Its underlying account infrastructure is EVM-based; accepting funds from TON via conversion does not prove native TON stealth-account support. [FAQ](https://docs.fluidkey.com/readme/frequently-asked-questions/).

Indexed X mirrors surfaced recent company-organized customer chats and product announcements. Full videos/replies were not examined, so they do not independently validate satisfaction. [Indexed founder feed](https://ww.twstalker.com/moritz_fluidkey). Targeted Reddit searches did not produce enough substantive Fluidkey-specific feedback to claim community consensus.

### Succession planning: Casa and existing Wallet functionality

Casa's May 21 documentation describes recipient setup, health checks and a six-month request period with owner objection. These are working precedent features, not inventions of this proposal. [Casa documentation](https://support.casa.io/knowledge/basic-inheritance-for-standard-members).

June and August Reddit threads discuss nontechnical heirs and missing recovery instructions. Some authors are building products; these are need signals, not a representative sample. [June discussion](https://www.reddit.com/r/Bitcoin/comments/1ua0w2m/how_are_you_handling_inheritancesuccession_for/), [August discussion](https://www.reddit.com/r/Bitcoin/comments/1vkc6h9/how_are_you_planning_inheritance_for/).

Crucial overlap: Wallet ALREADY offers a deceased-account support process for custodial Crypto Wallet. It requires legal authority and documentation and excludes DeFi Account. A generic “inherit crypto” entry would overlook this. [Wallet policy](https://help.wallet.tg/article/620-managing-account-after-a-persons-passing).

## Five working concepts

### 1. Wallet Versus — “Trade which asset does better.”

User chooses two supported assets, an equal initial notional on each side, and a reviewed risk allocation. Wallet opens a long on A and short on B, presenting the two positions as one strategy with separate leg health, combined costs and P&L.

Illustration, not a live quote: long $100 of A and short $100 of B. If A falls 5% and B falls 15%, gross P&L is -$5 + $15 = +$10 before fees/funding, assuming both positions remain open. This is a relative view that can work even when both prices decline. Different sizing, funding, execution and liquidation can change the result.

MVP: two liquid instruments on one venue; combined review/close workflow; no AI selection, social copying, baskets or automatic rebalancing. Partial fill must show an incomplete strategy and trigger an explicitly authorized recovery action. Never promise atomic fills or automatic market neutrality. Manual position risk reduction must remain available.

Wallet difference: a distinct relative-trade workflow beyond standalone long/short controls. Originality is in the accessible Wallet integration, not inventing pairs trading. Prior comment themes include hedge mode and advanced UI; compare exact entries before claiming a gap. The catchy name is a proposed creative hook, not evidence of a viral phrase.

### 2. Wallet Events — “Take a position on an outcome.”

Curated, legally eligible event contracts with clear resolution source/time, executable price, maximum stake loss, fees and early-sale liquidity. Begin with narrowly defined economic outcomes through an eligible partner; no user-created markets, parlays or inducements to keep betting in the MVP.

This adds event outcomes rather than another spot asset. Wallet's earlier price-guessing promotional game is adjacent but not proof of live real-money event contracts. Avoid claiming the concept is globally original. Region/age eligibility, market integrity, disputes and gambling/derivatives classification are launch gates requiring qualified review. Early cash-out is not guaranteed.

### 3. Private Receive — “Get paid without sharing your whole portfolio.”

Proposed for self-custodial receiving: a reusable payment link resolves to a fresh receiving account; users see one dashboard, payment labels and an exportable record. No automatic aggregation that silently destroys the promised privacy.

Scope matters: ordinary custodial Wallet contact transfers do not publish the recipient's internal balance. The target problem is reuse of public onchain addresses. Native TON implementation, recovery of derived accounts, gas, view access and spend-linkability remain unresolved. Reject if the necessary architecture is disproportionate to the verified need. This differs from the earlier Private Proofs idea, which concerned disclosing individual claims rather than separating incoming payments.

### 4. Legacy Setup — “Leave a plan your family can actually follow.”

For custodial Wallet, make advance preparation visible: chosen emergency contact, readiness checklist, private instructions, periodic confirmation and a legally reviewed claim-start flow. Naming a contact gives no spending authority and does not establish inheritance rights. No inactivity-triggered automatic transfer.

The incremental benefit would be preparation before loss, not replacing Wallet's existing claims process or guaranteeing a beneficiary payout. Self-custody recovery is a separate security design and should not be bundled into the MVP. Less exciting as a market trend, but a distinct human need worth retaining as a reserve.

### 5. Funding Control — retained from V4

Position-linked funding hedging remains the technical candidate. It controls a different exposure from Versus: financing-rate risk rather than relative price performance. Its economic and failure-mode checks remain incomplete; this scan did not execute hedge quotes or validate a live Wallet integration. See [V4](WALLET_IDEA_RESEARCH_V4_2026-09-15.md).

## Exclusions and priorities

- Social-feed trading, generic AI agents, stocks and automatic rebalancing remain crowded. Velvet's September 9 August recap verifies new AI/trading features but not independent adoption or a Wallet gap. [Recap](https://blog.velvet.capital/p/velvet-august-update-velvet-flash).
- Options protection remains a research reserve. Recent Derive market activity indicates options use, but this round did not validate a specific affordable retail protection product suitable for Wallet. Do not extrapolate institutional derivatives volume into retail demand. [Market participant analysis](https://www.falconx.io/newsroom/exploring-derives-record-options-surge).
- Do not sell five ideas merely to fill five slots. Current development priority: Versus for a clearer exciting hook; Funding Control for technical depth; Private Receive for a nontrading use case. Events and Legacy Setup require larger overlap/fit decisions.
- The five are differentiated by user job, not just names. None has passed a fresh full contest-comment check or implementation test. Prior art is disclosed rather than disguised.

No messages, trades, settings changes, external submissions or image generation occurred. Research files only were added.
