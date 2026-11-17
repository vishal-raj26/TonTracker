# Wallet contest: consolidated research and final five

> Superseded by [WALLET_FIVE_ENTRIES_VALIDATED_2026-09-15.md](WALLET_FIVE_ENTRIES_VALIDATED_2026-09-15.md). The final direct comment check found substantial Storylines overlap. The privacy architecture below was also corrected: shared-key subwallets do not provide the claimed separation. This document is historical research, not the current submission set.

Research cutoff: 15 September 2026. This is product research, not investment advice. No contest entry, trade, account setting or external message was submitted.

## Decision

The result is a portfolio of **five equally serious entries**, not one lead plus four backups. Each addresses a different user job and should be developed to the same standard of depth. Their risks and audiences differ, but none is being included merely to fill a slot.

The five entries are:

- **Wallet Storylines** — buy a transparent idea, not a list of tickers.
- **Wallet Replay** — trade the past before risking the future.
- **Risk Lock** — set rules while calm; Wallet enforces them when markets get loud.
- **Private Receive** — one payment link, a fresh onchain address every time.
- **Wallet Pulse** — turn Telegram's polls into live, tradable probabilities, where legally eligible.

This shortlist deliberately includes adaptations. The contest asks how fresh the idea is and how it sets Wallet apart; it does not require invention of a new financial primitive. Prior art is therefore evidence of feasibility, provided the Wallet implementation has a distinct user job and product advantage.

## What was checked

- Read the official contest criteria and the recent one-year Wallet announcement archive: 242 posts from September 2025 through September 2026.
- Reused the earlier live product audit of Crypto Wallet and DeFi Account and checked it against current help material and the latest channel announcements.
- Reopened the Telegram Web discussion attached to contest post 838. The UI displayed 408 comments. The loaded accessibility tree contained 45 message blocks with `#WalletIdeas`, plus replies and non-entry discussion. This is a broad accessible sample, not proof that every comment, image, synonym or later submission was captured.
- Reviewed recent official launches, product documentation, indexed X posts and user discussions on Reddit. Provider claims, social anecdotes and verified shipped features are treated as different evidence levels.
- Compared each finalist with Wallet's current product, known comment themes, implementation constraints and a specific global precedent.

The comment composer currently states that media is not allowed in this discussion. An admin reply says multiple entries are allowed but “only one will be considered” and asks users not to spam. This needs to be reconciled with the five-entry plan before posting: the five can be prepared as equally valuable entries, but posting mechanics should follow the latest official clarification. [Admin reply](https://t.me/wallet_news_en_chat/549750)

## Current Wallet boundary

Wallet is no longer only a Telegram payment wallet. The reviewed product now includes spot trading, more than 200 assets, tokenized stocks and ETFs, Gold, pre-IPO exposure, Earn, P2P, card withdrawal in supported regions, perpetuals through Lighter, TP/SL, margin and position resizing, candlesticks, heatmaps, contact transfers, Stars withdrawal and rewards/Squads. Gram wallet is positioned as the simple newcomer entry point, while Wallet is positioned as the next step for people ready to trade, earn and manage more assets.

That boundary screens out many superficially attractive ideas. Contact sends, generic cards/QR payments, ordinary subscriptions, group bills, portfolio P&L, DCA, generic rebalancing, basic escrow, copy trading, generic AI assistants, more token listings, basic scam warnings and ordinary limit orders are already present, established elsewhere, or heavily represented in the accessible contest comments.

## Comparative score

Scores are editorial judgments out of five, not measured demand or the Wallet team's scores.

| Idea | Depth | Value | Originality in Wallet | Wallet fit | Feasibility risk | Overall judgment |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Storylines | 4.5 | 4.5 | 3.5 | 5 | Medium | Cross-asset discovery and execution |
| Replay | 4.5 | 4.5 | 3.5 | 5 | Low–medium | Newcomer-to-trader learning bridge |
| Risk Lock | 4.5 | 4 | 4 | 5 | Medium | Responsible perpetuals controls |
| Private Receive | 4 | 3.5 | 4 | 4.5 | Medium–high | Public-address privacy |
| Pulse | 4 | 4 | 3 | 4.5 | High | Telegram-native event probabilities |

Confidence is high that these five form a stronger and more diverse set than the previously explored Versus and Funding Control concepts. The scores identify where each entry needs extra evidence; they are not a ranking. There is no honest basis to guarantee a winner or claim Wallet-wide demand without user tests and internal data.

## Wallet Storylines

**Hook:** Buy the story, not seven tickers.

### Problem

Wallet increasingly publishes market narratives—AI infrastructure, Gold, copper, sectors and macro events—then leaves users to translate a story into individual assets, weights and multiple trades. Newer users either pick one fashionable ticker or abandon the task. Experienced users must build and track the exposure manually.

### Product

Storylines are curated, transparent baskets assembled from assets Wallet already supports. Examples are illustrative until eligibility and asset availability are checked:

- **AI Stack:** semiconductors, cloud platforms and selected infrastructure exposure.
- **Telegram Economy:** eligible TON ecosystem assets, with concentration warnings.
- **Defensive Mode:** Gold, a broad equity ETF and short-duration eligible exposure.

The user opens a Storyline card, sees every component, weight, issuer/network, risk, historical drawdown and current executable quotes, then chooses an amount. Wallet creates the component orders and shows actual fills. The user owns the resulting assets individually; the Storyline is a management view, not a mystery token or guaranteed-return product.

Rebalancing is never silent. When weights drift or the editorial composition changes, Wallet shows what would be bought and sold, tax/fee implications where relevant, and asks for confirmation. Users can sell the basket proportionally or edit components.

### Why it fits Wallet

Wallet already has a wider asset palette than many single-chain consumer wallets, and its channel already explains markets as stories. This turns existing education and catalog breadth into a product workflow. A Storyline card can be shared in Telegram; recipients see the thesis and risks and make their own decision. Sharing never auto-copies a position.

### Precedent and trend

Cesto launched cross-asset baskets spanning tokens, tokenized stocks and protocols; its site presents one-click themed baskets and user-controlled rebalancing. Crypto.com offers customizable crypto baskets and recently added stock “Whale Baskets.” Fidelity provides one-click fractional stock/ETF baskets. These prove the interaction pattern, not Wallet demand. [Cesto](https://cesto.co/), [Crypto.com Crypto Basket](https://crypto.com/us/app/cryptobasket/), [Crypto.com Whale Baskets](https://help.crypto.com/en/articles/11424523-whale-baskets), [Fidelity Basket Portfolios](https://www.fidelity.com/direct-indexing/customized-investing/overview/)

### Comment differentiation

The accessible discussion contains DCA, rebalancing, AI portfolio and xStocks portfolio suggestions. No exact cross-asset narrative product joining Wallet's crypto, stocks/ETFs and metals was identified. The entry must explicitly distinguish Storylines from an auto-rebalanced portfolio or generic AI adviser. Its core is “one thesis, transparent components, Wallet's full asset shelf.”

### Failure cases and MVP

- Start with one curated basket of liquid, region-eligible spot assets; no leverage, lending, yield stacking or prediction markets inside the basket.
- Block purchase if a component quote is stale or unavailable. Do not silently redistribute its weight.
- Show requested versus filled allocation and residual cash.
- Never use backtested return as a promise. Thematic products can concentrate risk and arrive after a trend is crowded.
- Do not imply tokenized stocks give shareholder rights where they do not.

### Why it earns a place in the five

It is visual, explainable in seconds, useful to a broad audience, feasible through products Wallet already operates, and naturally shareable without turning into copy trading. Its originality is the Wallet-specific combination, not the basket primitive.

## Wallet Replay

**Hook:** Trade the past before risking the future.

### Problem

Wallet is adding increasingly advanced trading tools while Gram wallet is designed to bring newcomers into crypto. Reading about liquidation, funding and stop-losses is not the same as experiencing them. Sending a newcomer directly from a simple wallet into live perpetuals is a poor learning path.

### Product

Replay lets a user relive a real historical market window with a simulated Wallet balance and without seeing the future candles. The interface matches Wallet's actual spot/perpetual flow. Orders include simulated fees, funding, slippage, minimum sizes and liquidation rules instead of fantasy fills.

Users can start from a Wallet channel post—“BTC is back above…”—tap **Replay this market**, make decisions candle by candle and compare the result with holding, doing nothing and their stated risk limit. A private review explains which losses came from direction, leverage, funding, fees or failure to use a stop. Results can be shared as a clearly marked simulation card; no fake P&L that can be mistaken for live performance.

### Why it fits Wallet

It creates a clear Gram → Wallet learning bridge, reuses Wallet charts and public market content, and teaches the exact mechanics of the product the user may later choose to use. Telegram-native weekly challenges can reward correct risk understanding rather than the highest leveraged return.

### Precedent and trend

TradingView offers historical Replay Trading, paper trading and recurring simulated competitions. Binance and OKX offer demo trading; recent beginner discussions repeatedly recommend paper trading before live leverage. The generic simulator is proven. Wallet's differentiation is a mobile, Telegram-native replay tied to its own content and exact product mechanics. [TradingView replay](https://www.tradingview.com/support/solutions/43000691889-learn-to-trade-on-historical-data/), [TradingView demo tools](https://www.tradingview.com/support/solutions/43000754966-demo-features-on-tradingview/), [OKX demo trading](https://www.okx.com/en-gb/help/how-to-use-demo-trading), [recent beginner discussion](https://www.reddit.com/r/CryptoHelp/comments/1v1w25b/where_should_i_start_if_i_want_to_really/)

### Comment differentiation

No exact historical replay or faithful Wallet simulator was identified in the accessible contest entries. Education, AI guidance and rewards are adjacent. Avoid pitching another academy, quiz or learn-to-earn campaign; the product is experiential practice with real historical mechanics.

### Failure cases and MVP

- Start with three curated historical scenarios and one asset, not an entire simulation exchange.
- Label every screen and share card **Simulation — no real funds**.
- Include realistic costs and wick/liquidation behavior. State that simulated success does not predict live profitability.
- Do not reward raw return; that teaches oversized risk. Score rule-following, drawdown control and comprehension.
- Never unlock higher leverage merely because a user won a game. Eligibility and suitability remain separate.

## Risk Lock

**Hook:** Set the rules while calm. Wallet keeps them when markets get loud.

### Problem

Wallet provides TP/SL, margin controls and position resizing, but those are trade-level tools. They do not stop a user from repeatedly reopening larger positions after a loss. Recent discussions about revenge trading consistently describe the gap between knowing a limit and obeying it during emotional trading.

### Product

Before a session, an eligible perpetuals user can set one or more account-level rules:

- maximum daily realized + unrealized loss;
- maximum leverage;
- maximum number of new trades;
- mandatory cooldown after consecutive losses;
- manual lockout for a chosen period.

The user then taps **Lock my rules**. Rules can be tightened immediately but cannot be loosened until the displayed expiry. The remaining budget is visible before every order. When a threshold is reached, Wallet cancels eligible pending opening orders, prevents new/increasing exposure and preserves reduce-only closing. Automatic market liquidation is not the default because slippage can exceed the threshold; the user chooses the enforcement behavior in advance.

### Why it fits Wallet

Perpetuals are now a major Wallet direction. A serious trading product should offer portfolio-level behavior controls as visibly as it offers leverage. Telegram is always open and markets are 24/7, so friction against impulsive re-entry has unusually high product relevance.

### Precedent and trend

Binance has a margin cooling-off period. TopstepX documents daily loss limits, risk-setting locks and timed lockouts that support cannot reverse. New 2026 user discussions explicitly recommend broker-enforced daily loss limits and post-loss cooldowns. These are proven controls adapted to Wallet's isolated-margin perpetuals. [Binance cooling-off](https://www.binance.com/en/support/faq/detail/9c660522f69547e8bcda1e7649c7b33b), [TopstepX controls](https://help.topstep.com/en/articles/14434175-topstepx), [revenge-trading discussion](https://www.reddit.com/r/propfirm/comments/1v4c5po/revenge_trading_destroyed_my_eval_today/)

### Comment differentiation

The accessible discussion includes safety centers, scam detection, spending limits and emergency freeze ideas. No exact self-imposed, time-locked trading rules for Wallet perpetuals was identified. The contest entry must keep this behavioral-risk focus; it is not another security dashboard.

### Failure cases and MVP

- MVP: maximum leverage, session loss budget and manual cooldown only.
- Define whether the loss budget includes unrealized P&L, realized P&L, funding and fees; show it plainly.
- Never block reduce-only risk reduction or withdrawals.
- Explain that market moves and slippage can take losses beyond a trigger.
- Provide emergency support for account compromise without allowing support to casually reverse a voluntary trading lock.
- Test overlapping positions and orders so a lock cannot accidentally increase exposure.

## Private Receive

**Hook:** One payment link. A fresh address every time.

### Problem

Contact-to-contact transfers inside custodial Crypto Wallet are not the issue. The problem appears when a freelancer, creator, merchant or public community posts one DeFi Account address repeatedly. Anyone can inspect that address's balance and payment history and link multiple counterparties.

### Product

The user shares one stable Wallet payment link or QR. Each payer receives a fresh TON receiving address controlled by the same user. Wallet discovers all incoming payments, labels them by link/invoice and shows them in one inbox. The user can spend from an individual receiving account or deliberately consolidate with a clear warning that consolidation may reveal a relationship between addresses.

This is recipient privacy and address separation, not anonymity, hidden amounts or a mixer. Wallet still applies its normal compliance and sanctions obligations where relevant.

### Why it fits Wallet

Correction: TON exposes the public key in wallet contract state. Different subwallet identifiers using the same key therefore permit linkage and are not a privacy architecture. The revised proposal requires separately derived receiving keys, recovery metadata and an explicit threat model. [TON wallet model](https://docs.ton.org/contracts/standard/wallets/how-it-works)

### Precedent and trend

Fluidkey gives users a stable receiving identity that resolves to fresh accounts and manages them in one interface. Ethereum documentation explains the recipient-privacy benefit and limits of stealth addresses. This proves the user experience, not a drop-in TON implementation. [Fluidkey](https://www.fluidkey.com/), [Fluidkey limitations](https://docs.fluidkey.com/readme/frequently-asked-questions/), [Ethereum privacy overview](https://ethereum.org/privacy/ethereum)

### Comment differentiation

No exact reusable-private-receive entry was identified in the accessible sample. Private proofs, identity/reputation and security ideas are adjacent but solve different jobs. The proposal must not claim to hide the sender, amount or later fund flow.

### Failure cases and MVP

- Start with TON receiving in DeFi Account only; no promise for every jetton/network.
- Recovery from the seed/key must rediscover every funded address deterministically.
- Avoid silent consolidation. Show its privacy consequence before signing.
- Explain that counterparties, timing, spending patterns and Wallet's own service view may still create links.
- Test dust/spam, undeployed account gas, notification reliability and export completeness.

## Wallet Pulse

**Hook:** Telegram already debates what happens next. Show the probability.

### Problem

Wallet's channel repeatedly asks binary market questions through emoji reactions and price-guessing contests. Reactions express sentiment but do not aggregate informed conviction, show changing probability or resolve transparently. Users leave Telegram for prediction platforms with separate onboarding and funding.

### Product

For legally eligible adults and regions, Wallet offers a small set of curated, partner-powered event contracts with objective resolution sources and deadlines. A channel or chat card shows the current probability; tapping it opens the full rules, executable bid/ask, fees, maximum loss, liquidity and resolution source. Users can take a bounded position or simply follow the probability without trading.

MVP should begin with clearly measurable financial or crypto events, one regulated/eligible partner, strict position limits and no user-created markets, parlays or social leaderboards. The market card updates after resolution and links to the source.

### Why it fits Wallet

This turns an interaction Wallet already uses—polling its Telegram audience—into an information and trading object without forcing a new app. It is more culturally native than dropping a generic prediction-market tab into Wallet.

### Precedent and trend

Wallet integrations are accelerating: Binance Wallet integrated Predict.fun, BM Wallet launched embedded prediction markets, Crypto.com launched OG, and MoonPay integrated Myriad. X discussions also show trading terminals combining spot, perpetuals and probability markets. These demonstrate momentum, while provider volumes must not be accepted uncritically; Limitless disclosed substantial manufactured volume in its own ecosystem update. [Binance Wallet integration](https://www.theblock.co/news/markets/2026-04-09-binance-wallet-rolls-out-gas-free-prediction-markets-via-predict-fun-integration-396858), [BM Wallet](https://www.globenewswire.com/news-release/2026/07/06/3322803/0/en/focusing-on-on-chain-native-prediction-markets-bm-wallet-launches-prediction-markets-reimagining-the-web3-user-experience.html), [Crypto.com OG](https://og.com/company-news/cryptocom-launches-og-a-new-prediction-market-experience), [MoonPay/Myriad](https://www.moonpay.com/newsroom/myriad), [Limitless disclosure](https://limitless.exchange/blog/the-huddle-issue-01-jun-30th)

### Comment differentiation

No exact prediction-market entry was identified in the accessible 45 hashtag blocks. Gaming, polls, trading signals and event tickets are adjacent. Recheck the live discussion immediately before submission; absence in the loaded sample is not exhaustive clearance.

### Failure cases and MVP

- Region, age and product eligibility are hard launch gates.
- Publish the resolution source, cutoff, cancellation rules and dispute process before order entry.
- Show executable prices and depth; a displayed probability is not necessarily the price available for the user's size.
- Maximum loss must be visible in currency, not only contract units.
- No political market in the first concept mockup; it distracts from product value and increases jurisdictional controversy.
- Reject the idea as a near-term entry if Wallet cannot identify a compliant partner and supported launch region.

## Why the other researched ideas are not in the five

### Spend Pass / bot allowances

Scoped permissions for agents and Mini Apps are a real 2026 trend. Coinbase documents spend permissions and Trust Wallet has promoted agent tooling with developer-defined policies. However, TON Connect currently requests transaction signatures rather than exposing a standard standing allowance, and Telegram requires Stars for digital goods and services sold inside bots/Mini Apps. A generic “let bots spend USDT” pitch would be misleading. The concept could return later as an onchain-action permission system, but its first safe user job is not yet narrow enough. [Coinbase spend permissions](https://docs.cdp.coinbase.com/wallets/using-wallets/spend-permissions), [TON Connect](https://docs.ton.org/applications/ton-connect/overview), [Telegram digital-goods rule](https://core.telegram.org/bots/payments-stars)

### Funding Control

Position-linked funding hedging has technical depth and a clean Wallet-perpetuals fit. It remains too narrow, hard to explain and operationally dependent on matched reference markets, collateral and two risk systems. It was excluded because it adds less audience diversity and immediate clarity than the selected five.

### Wallet Versus

Pear already provides paired/basket positions on Lighter with combined tracking and controls. User demand was not established, and Wallet's isolated-margin model complicates the promised simplicity. The separate stress test found it weaker on originality and demonstrated value than the selected set.

### Generic stablecoin pay, cards and local QR

Stablecoin spending is one of 2026's clearest market trends, with new launches from Tether, LINE, Stable and Exodus. It is also one of the most saturated themes in the accessible contest comments, including cards, QR, local bank rails, remittance and automatic conversion. Important does not equal distinctive for this contest. [Tether Wallet](https://tether.io/news/tether-launches-tether-wallet-the-peoples-wallet-extending-its-global-financial-infrastructure-directly-to-billions-of-users-left-behind-by-the-traditional-financial-system/), [LINE Unifi](https://lps-editor-2050.landpress.line.me/en/pr/news/global/20260309/), [StablePay](https://www.prnewswire.com/news-releases/stable-launches-stablepay-instant-zero-fee-global-payments-app-built-on-stablecoin-rails-302825737.html), [Exodus Pay](https://www.exodus.com/investors/news-events/press-releases/detail/103/exodus-launches-exodus-pay-to-let-users-spend-send-and-earn-rewards-from-one-app)

### Proofed Calls / social copy

Telegram has strong trading-discussion culture, but the accessible comments already contain copy trading, trust profiles and AI signals. Even a verifiable thesis card risks encouraging manipulation, selective sharing and performance chasing. It is a possible layer on Storylines or Replay later, not a clean standalone finalist.

## Submission recommendation

Develop all five as complete, independent entries. Before posting:

1. Recheck new comments for exact overlap with each idea, not only Storylines.
2. Give every entry its own mobile mockup showing the decisive interaction rather than one generic promotional poster.
3. Write each comment around one user story, concrete workflow and failure boundary; disclose precedent honestly instead of claiming the primitive is new.
4. Keep every core entry readable inside Telegram. Link to a fuller presentation only if external links are confirmed acceptable; direct media is currently disabled in the discussion.
5. Resolve the admin's “only one will be considered” wording before sending five separate comments. If five separate submissions would be treated as spam, package the five as one coherent “five product paths” entry rather than assigning them an artificial rank.

## Final confidence statement

The research supports confidence in the **five-part portfolio**, not certainty about the team's internal roadmap or winner. Storylines covers cross-asset discovery, Replay covers experiential learning, Risk Lock covers behavioral safety, Private Receive covers public-address privacy, and Pulse covers Telegram-native event information. Each is valuable on its own terms. Their different implementation risks should shape the depth of each presentation, not their status in the set.
