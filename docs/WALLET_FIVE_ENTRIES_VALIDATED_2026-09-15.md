# Wallet: five developed contest entries

15 September 2026. Current decision record; supersedes the earlier final-five brief. All five receive equal development effort. There is no lead or fallback order. Numbering is for navigation.

## Research conclusion and completion standard

The discovery and desk-review stage is complete. Each entry now has a specific user problem, an existing product precedent, a documented or observed Wallet gap, an explicit comparison with accessible comments, a bounded first release, and a way to evaluate value. This is enough to prepare contest concepts. It is not evidence of completed user testing, internal roadmap approval, audited software or a secured partnership.

We will reopen a concept only for new material evidence: an exact duplicate, a newly shipped Wallet feature, or a technical fact that invalidates its mechanism. We will not keep changing the set based on whether it feels exciting in a later conversation.

## What the closing review changed

- **Storylines removed.** Directly rereading the live discussion exposed both themed xStocks portfolios and mixed crypto/xStocks rebalancing. Combining these with a new name is too close to the existing submissions for this brief. The earlier claim that adding crypto and stocks creates a clear originality gap was overstated.
- **Return Desk added.** Wallet documents a concrete custodial return problem and a support-mediated recovery process. This is a practical service improvement with established self-service recovery precedents elsewhere.
- **Replay retained and focused.** Its recurring use is reviewing the user's own closed trades, with a few curated practice scenarios for newcomers. This is a retention hypothesis with a measurable test, not a claimed proven habit.
- **Risk Lock retained and made precise.** It stops additional exposure after a session loss trigger. It does not promise that losses cannot exceed that amount.
- **Private Receive corrected.** Same-key TON subwallets are linkable. Separate derived keys can remove that specific link, while transaction patterns and the payment-link service remain privacy limits.
- **Pulse retained as a partner integration proposal.** Public APIs establish technical precedent, not legal eligibility or a Wallet partnership. Reading probabilities and trading contracts are separate product capabilities.

## Evidence and coverage

Prior work includes a 242-post official announcement archive for September 2025–September 2026 and a live Wallet inspection. This closing pass reread current Wallet trading/recovery documentation and reopened the Telegram channel and post 838 discussion. The UI still displayed 408 comments. Relevant text was read from the loaded discussion, which previously contained 45 hashtagged message blocks. No exact copies of these five mechanisms were found in that accessible sample; this is not clearance against every unloaded comment, image or future entry.

The recorded product audit plus current public documentation did not expose the proposed flows. That supports a public product gap, not certainty about every regional rollout. No funded action or new live-app audit was performed in this closing pass.

Recent X and Reddit material was used for discovery and reported user problems. Product documentation was used to verify mechanics. No follower count, anecdote, launch announcement or company-reported volume was treated as proof that a feature has broad retained usage.

## Four-criterion review

These are qualitative assessments of the proposals, not scores or guaranteed outcomes.

| Entry | Depth: concrete mechanism | Value: user problem | Originality: reviewed-comment difference | Wallet fit |
| --- | --- | --- | --- | --- |
| Return Desk | Withdrawal-linked case, evidence and crediting timeline | Returned money is confirmed onchain but missing from account | Custodial return attribution, distinct from hacked-account recovery | Directly addresses Wallet's central withdrawal address |
| Replay | Actual trade review plus a labeled alternative scenario | Users struggle to understand which decisions produced a result | Historical learning workflow, distinct from P&L charts and AI tips | Uses existing trades, charts and perpetual mechanics |
| Risk Lock | Session rules enforced across Wallet order entry | Users reopen or enlarge trades after reaching their own limit | Voluntary trading commitment, distinct from scam warnings | Extends Wallet perpetuals and position resizing |
| Private Receive | Separate receiving keys, one inbox, explicit recovery | Public payment address exposes unrelated balances and receipts | Payment-address separation, distinct from trust profiles | DeFi Account receiving and Telegram payment sharing |
| Pulse | Partner event contracts with sourced probabilities and resolution | Users leave Wallet to follow or trade event outcomes | Event contracts, distinct from promotional guessing games | Extends Trade and existing channel polls |

## 1. Return Desk

**Hook: Bring returned funds back into view.**

### User and gap

A user withdraws from Crypto Wallet to an exchange. The exchange rejects the deposit and returns it. The return reaches Wallet's central address, but has not been attributed to the user's account. Wallet's own guide asks the user to contact support and supply return details and ownership evidence. The gap is an integrated case attached to the original withdrawal, not the absence of any recovery service. [Wallet recovery guide](https://help.wallet.tg/article/250-sending-ton-to-exchanges)

### First release

History → original withdrawal → **Exchange returned this**. Wallet pre-fills its own withdrawal reference, asset, network, date and amount. The user adds the return hash and exchange confirmation. A single case shows:

1. Return evidence needed.
2. Return transaction located and confirmed, when actually verified.
3. Ownership/compliance review, including a precise user action when required.
4. Credited, with amount, deductions if any and linked ledger receipt.

The interface always says who must act next. It retains the original withdrawal and return as distinct transactions. Matching a public hash or amount does not prove ownership; ambiguous or partial/batched returns go to review. A repeat submission opens the existing case instead of duplicating it.

### Precedent, value and limits

Coinbase provides a browser recovery flow for selected unsupported assets. That is a different recovery scenario, but proves the value of collecting evidence and eligibility in a structured tool. Wallet's proposed difference is linking a returned withdrawal to the user's existing account record. [Coinbase recovery](https://help.coinbase.com/en-gb/coinbase/trading-and-funding/sending-or-receiving-cryptocurrency/recover-unsupported-crypto)

Start with one supported network and exchange-return cases. Wallet cannot force the other exchange to return funds or guarantee every claim. Measure repeated evidence requests, case completion, time spent waiting for user action and support contacts per case. The affected audience size is unmeasured; severity and the manual process are documented.

**Comment check:** nearby ideas describe compromised-account recovery, transfer safety and escrow refunds. None of the loaded matches described attribution of an exchange return to Wallet's central address.

**Visual brief:** original withdrawal receipt alongside a four-step return case; the key line is “Next action: add the exchange's return transaction.” No invented successful recovery or processing-time promise.

### Contest draft

**Wallet Return Desk — bring returned funds back into view.**

An exchange can return a withdrawal to Wallet's central address without the money immediately appearing in the user's balance. Today, the user has to collect details and work through support.

Add “Exchange returned this” to the original withdrawal. Wallet already knows the outgoing transaction; the user supplies the return hash and exchange confirmation. One case then tracks evidence, confirmed return, ownership review and final credit, always showing who needs to act next.

This would reduce repeated explanations and make a stressful money problem understandable. Recovery tools exist elsewhere; the Wallet-specific improvement is connecting both transactions and the support case inside the original receipt. It would preserve verification requirements and never promise a refund before attribution is complete.

#WalletIdeas

## 2. Wallet Replay

**Hook: Make your last trade your next lesson.**

### User and gap

A trader closes a position but cannot readily distinguish the effect of entry timing, resizing, fees, funding and liquidation mechanics. Wallet already displays performance; the proposed feature reconstructs the sequence of decisions. Its regular entry point is **Review this trade** on a closed position, while newcomers can use curated historical practice sessions.

### First release

Start with one liquid perpetual market and a limited historical window. Replay the user's actual fills, margin changes and costs against the recorded mark-price timeline. Actual records remain fixed. A separate **Try another decision** branch allows one change, such as a smaller position, then labels the result as a modeled scenario. It never overwrites actual history.

The review shows the outcome, costs and largest drawdown, then asks the user to save one lesson. A saved lesson can appear before their next trade without providing an automatic trade recommendation. Curated exercises use hidden future candles; reviewing a known trade is explicitly retrospective.

### Precedent, value and limits

TradingView provides historical Replay Trading with order controls and reports. Wallet can adapt that interaction to its own trade records. The reason to return is each completed trade; repeat usage must be tested rather than assumed. [TradingView replay](https://www.tradingview.com/support/solutions/43000691889-learn-to-trade-on-historical-data/)

Wallet's documentation says funding affects margin and is included in profitability but not Transaction History. An accurate reconstruction therefore requires Wallet's internal event records, not screenshots alone. [Wallet trading mechanics](https://help.wallet.tg/article/634-trade-and-trading-assets-in-wallet)

Historical candles alone cannot establish exact stop/liquidation ordering inside a candle. Where underlying data is insufficient, show uncertainty or disable that modeled branch. Do not infer exact historical fills or apply today's fees to older trades. Measure repeat review use and comprehension of costs and risk; do not reward simulated return or encourage extra trading to earn lessons.

**Comment check:** existing chart/P&L and AI guidance ideas are adjacent. No exact replay of a completed trade with separate actual and modeled branches appeared in the loaded matches.

**Visual brief:** a closed-trade timeline with Actual selected, a separate Scenario tab and a short explanation of fees/funding. Every modeled figure carries a Simulation label.

### Contest draft

**Wallet Replay — make your last trade your next lesson.**

After closing a perpetual position, tap “Review this trade.” Wallet replays the actual entry, size changes, margin changes, exit and costs so you can understand how the result developed.

Then try one alternative decision in a clearly labeled simulation—for example, a smaller position—and save a lesson for next time. Actual history stays unchanged. New users could practice a few historical market scenarios in the same interface.

Historical replay is proven in trading platforms. Wallet's opportunity is to bring it directly to the trades users already make, using its own funding, fees and margin rules. Start with one liquid market and show uncertainty when historical data cannot support an exact simulation. Success should mean better understanding and repeat reviews, not more trades or higher simulated returns.

#WalletIdeas

## 3. Risk Lock

**Hook: Set your limits while calm. Keep them when it matters.**

### User and gap

A perpetuals trader reaches their intended daily limit, then opens a larger trade to recover losses. Existing TP/SL protects an individual order; it does not enforce a chosen session rule across new orders. TopstepX already documents locked risk settings and cooldowns, establishing precedent for the mechanism. [TopstepX risk controls](https://help.topstep.com/en/articles/14434175-topstepx)

### First release

User chooses a maximum opening leverage, session loss trigger and lock expiry. Show all three in a confirmation and save the policy on Wallet's server. Tightening is immediate; loosening waits until expiry. Use a rolling session with an explicit end time, avoiding a timezone-based instant reset.

Define net session performance as realized trading P&L plus the change in unrealized P&L since session start plus signed funding minus fees, with no double counting. Deposits and collateral transfers do not reset it. When the loss trigger fires, cancel opening orders, block new/increasing exposure and keep closing/reducing available. The latch remains active if P&L later recovers. Enforcement must cover every Wallet entry path and survive device changes.

This is a **stop adding risk** control. Open positions can continue losing; a trigger is not a guaranteed maximum loss. Margin removal and other actions that increase effective exposure need policy checks, while closing remains available. Independent trading outside Wallet is outside its scope.

### Value and evaluation

Recent discussions report users ignoring their own loss limits and recommend mechanical lockouts. These are anecdotes supporting the problem, not measured effectiveness. [User discussion](https://www.reddit.com/r/propfirm/comments/1v4c5po/revenge_trading_destroyed_my_eval_today/)

Measure voluntary use, attempted blocked openings, comprehension and support incidents. Test simultaneous order submissions, pending-order fills and session expiry. Do not claim the control prevents every loss.

**Comment check:** scam detection, spending limits and transfer cooldowns exist in comments; no exact locked session policy for perpetual trading was found in the loaded sample.

**Visual brief:** three chosen rules, an expiry timestamp, then the triggered state with Close/Reduce still available.

### Contest draft

**Wallet Risk Lock — set your limits while calm.**

Stop-losses manage a position. Sometimes the bigger problem is the next trade opened after a loss.

Let users set a session loss trigger, maximum opening leverage and cooldown, then lock those rules until a chosen time. Once triggered, Wallet cancels opening orders and stops additional exposure while keeping position closing available. Rules can be tightened immediately, but increasing them must wait until expiry.

Professional trading platforms already offer versions of this. Bringing it into Wallet would give everyday perpetual traders practical control over impulsive re-entry. The counter should include trading results, fees and funding, and deposits must not reset it. This does not guarantee a maximum loss on existing positions; it helps users follow the boundaries they chose.

#WalletIdeas

## 4. Private Receive

**Hook: Get paid without publishing all your receipts.**

### User and gap

A freelancer publishes a DeFi Account receiving address. Clients can inspect unrelated receipts and balances at that same address. This problem concerns public onchain receiving; ordinary internal Crypto Wallet contact transfers have a different privacy model.

### Corrected architecture

TON stores a readable public key in each standard wallet contract. Changing only a subwallet identifier retains that key and permits linkage. The earlier proposal was wrong on this point. [TON wallet model](https://docs.ton.org/contracts/standard/wallets/how-it-works)

A credible design creates separate Ed25519 keys using a reviewed deterministic derivation scheme, builds standard receiving accounts from those keys and indexes them in one inbox. SLIP-0010 supplies a precedent for hardened Ed25519 derivation; compatibility with Wallet's current mnemonic/recovery system is a separate engineering requirement. This is a proposed architecture, not tested TON stealth-payment software. [SLIP-0010](https://github.com/satoshilabs/slips/blob/master/slip-0010.md)

### First release

DeFi Account → Receive → **Private payment link**. The device supplies a bounded pool of pre-generated public receiving addresses to the link service. Each request is assigned one unused address. The service never receives spending keys. Users see receipts together but funds stay in separate accounts unless deliberately combined.

The service can link the addresses it assigns. Independent keys remove the shared-public-key link, not timing, amount, funding or spend-pattern links. The promise is reduced public address reuse, not anonymity. Do not automatically fund every new account from one known personal wallet or silently sweep them all back to it.

Recovery requires an encrypted, portable record of the derivation version, issued index range and account versions, plus a recovery interface. A seed alone in a generic TON wallet may not discover these accounts. Exhaustion of the address pool must stop new link requests until safely replenished. Existing payment addresses remain valid.

### Precedent, value and evaluation

Fluidkey demonstrates fresh receiving accounts and one interface, while documenting service viewing access and later spending links. Its EVM implementation cannot simply be transplanted to TON. [Fluidkey FAQ](https://docs.fluidkey.com/readme/frequently-asked-questions/)

Start with one supported native asset. Before implementation approval, test recovery after device loss, address assignment, service outages and key/transaction linkability. Measure setup comprehension and successful recovery; receipt frequency is the hypothesized repeat-use trigger.

**Comment check:** trust-profile privacy and generic account security appear; no exact independently keyed receiving-account inbox was identified in the loaded sample.

**Visual brief:** one payment link above separate labeled receipts; disclosure says “Wallet's link service can associate these receipts. Blockchain amounts remain public.”

### Contest draft

**Private Receive — get paid without publishing all your receipts.**

Freelancers and creators often reuse one public crypto address. A client can then inspect unrelated payments and balances.

Add a reusable payment link in DeFi Account that assigns a fresh receiving account to each payment request, while Wallet displays the receipts in one inbox. Each receiving account needs a separate derived key; simply changing TON subwallet addresses would still leave a shared public key that can link them.

Products such as Fluidkey show the usefulness of this experience. A Wallet version should include portable recovery and explicit warnings before combining funds. It would reduce public address reuse, not promise anonymity: amounts and transaction paths remain public, and the link service can associate the receiving accounts. Begin with one asset and validate recovery before expanding.

#WalletIdeas

## 5. Wallet Pulse

**Hook: Follow the odds behind the headlines.**

### User and gap

Wallet already publishes polls and discusses market events. Pulse adds sourced market probabilities and eligible event-contract trading to that familiar interaction. A Telegram vote remains community sentiment; a venue quote represents the price of a particular contract. Neither is a guaranteed forecast.

### First release

Start with a few objectively resolved financial events. A card shows the contract question, source venue, last update, settlement deadline and probability convention. Open it to read resolution rules and available prices. Users may follow the event without opening a position. Trading appears only where Wallet and the partner permit it.

The trading review displays executable price, total cost including fees, units, payout if successful, maximum loss and early-sale liquidity. A confirmed order is not treated as filled until the provider reports its actual fills. Disputed resolution, cancellation and delayed settlement have explicit states.

### Verified integration route and limits

Polymarket publishes builder and order APIs and geographic checks. This establishes an integration path, not a Wallet commercial agreement or legal approval. The partner's collateral, custody, contract and eligibility requirements must all be mapped; Wallet USDT is not automatically a compatible balance. A geographic API returning eligible is also not a legal opinion. [Builder infrastructure](https://docs.polymarket.com/v2-migration), [geographic checks](https://docs.polymarket.com/api-reference/geoblock)

Correction to earlier research: MoonPay's Myriad announcement describes MoonPay powering funding and Myriad's in-app wallet. It does not establish Myriad trading embedded in MoonPay's own consumer wallet. Use it as funding-integration precedent only. [MoonPay announcement](https://www.moonpay.com/newsroom/myriad)

Until an approved trading integration exists, a sourced information/watchlist pilot can test interest, subject to data-use permissions. That pilot does not count as having delivered event trading. Measure repeat event follows, resolution comprehension, fill quality and eligible-user demand.

**Comment check:** no exact event-contract proposal appeared in the loaded keyword matches. No promise of full-discussion originality clearance.

**Visual brief:** a financial event card with venue/time, Follow and an eligibility-dependent View market action; the trade review distinguishes stake from payout.

### Contest draft

**Wallet Pulse — follow the odds behind the headlines.**

Wallet already asks its community what happens next. Add a small set of sourced event markets so users can follow changing probabilities and, where eligible, take a position through an approved partner.

Each card should show the precise question, market source, deadline and resolution rules. The order review should show the actual available price, fees, maximum loss and possible payout. Community poll results must remain separate from market prices.

Prediction platforms already provide the underlying markets and integration tools. Wallet's contribution would be bringing discovery, funding and settlement status into the app people already use for crypto. Begin with a few objective financial events, a region-approved partner and clear cancellation/dispute states. Users should also be able to follow an event without trading.

#WalletIdeas

## Presentation and posting handoff

Each of the five now has comment copy and a specific visual brief. The next production task is one presentation panel per idea with the same quality and depth. No presentation images have been generated in this review, and nothing has been posted.

The live discussion still says media cannot be sent. The admin's reply says multiple entries are allowed but only one will be considered. These are submission constraints, not reasons to rank the five or merge them without the user's direction. Keep all five drafts and verify permitted delivery when actually preparing to post. [Admin reply](https://t.me/wallet_news_en_chat/549750)

## Remaining uncertainties, precisely bounded

- Full contest-comment coverage and Wallet's private roadmap cannot be certified from the inspected material.
- Repeat use and audience size need user/product data; this document states hypotheses and evaluation methods rather than invented numbers.
- Private Receive needs security and recovery testing; Pulse needs an eligible partner integration. These are explicit development requirements, not claimed completed work.
- Return Desk's operational efficiency, Replay's historical-data availability and Risk Lock's enforcement coverage need internal implementation validation.

These limitations are appropriate to a feature proposal contest. They do not require restarting open-ended market research. All five are ready for concept presentation with these claims and boundaries.
