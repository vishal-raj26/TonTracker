# Wallet Ideas Contest: Product and Competitor Map

**Research cutoff:** 15 September 2026  
**Decision status:** No final idea selected. This is the evidence gate before concept development.

## What was checked

- 242 posts from the official English Wallet News channel, from 1 September 2025 through 15 September 2026, stored in `docs/research/wallet-announcements-2025-2026.json`.
- Wallet's public product/help pages and the contest post.
- Existing Telegram-native products and bots already recorded in `docs/WALLET_EXISTING_FEATURE_AUDIT.md`.
- Current official documentation from selected global wallets, exchanges and fintech apps.
- The authenticated Telegram Web discussion: 408 displayed comments, including 45 distinct loaded submissions carrying `#WalletIdeas`.
- The authenticated Wallet Mini App, inspected read-only on 15 September 2026 across Home, Trade, asset detail, Earn, transfer, deposit, withdrawal, notifications, account settings and tiers. No transaction or setting change was made.

The archive mixes launches, education, promotions and temporary campaigns. A channel mention is not automatically proof that a feature is currently available in every region.

## Contest gate

An idea is not ready merely because it sounds useful. It must pass all four tests:

| Criterion | Evidence required before submission |
| --- | --- |
| Depth | User journey, trigger, screens, rules, failure states, safety/regulatory constraints and success metrics |
| Value | Named user problem, affected audience, frequency/severity and why current workarounds fail |
| Originality | Comparison against Wallet, Telegram competitors and global products; exact differentiator stated |
| Wallet fit | Uses Telegram identity/chat/distribution or Wallet's custody, trading, P2P, Earn or DeFi capabilities in a way a standalone app cannot copy easily |

## Current product map

Wallet is no longer simply a chat payment wallet. Its current direction is a Telegram-native financial platform with three connected but distinct surfaces:

1. **Crypto Wallet (custodial):** buying, selling, sending to Telegram contacts, spot exchange, 200+ assets, P2P, Earn, tokenized stocks/ETFs/metals, and perpetuals.
2. **DeFi Account / TON Wallet (self-custodial):** onchain ownership, swaps, cross-chain deposits and withdrawals, and vault-based yield.
3. **Gram wallet:** a simpler newcomer entry product announced on 4 September 2026, with Wallet positioned as the next step for broader investing and trading.

### Material releases in the last year

| Period | Verified direction/release |
| --- | --- |
| Sep-Dec 2025 | Card withdrawals in selected regions; xStocks; iOS visual refresh; Monad assets and staking; stronger risk monitoring; Telegram-account recovery flow; easier P2P merchant status; 50+ P2P fiat currencies; import of merchant history from seven exchanges |
| Jan-Mar 2026 | Portfolio performance views; native MON staking; 24/7 xStocks trading; expanded xStocks/ETFs; public read-only P2P offers API; tokenized metals; cross-chain stablecoin funding; onchain DeFi vaults |
| Apr-Jun 2026 | 50+ perpetual markets with TP/SL; Rewards; shareable trade results; verified P2P counterparty names; additional Earn assets; referral program; chat/contact sending without addresses; pre-IPO and alternative-asset perpetuals |
| Jul-Sep 2026 | Telegram-channel Squads; market heatmap; margin and position resizing; tokenized IPO/listing access; Earn balance usable for spot trading; Gram wallet rollout; spot candlesticks |

The trajectory is clear: **asset breadth -> advanced trading -> loyalty/social distribution -> simpler onboarding and tighter Gram integration**.

### Live Mini App audit

The current interface has three persistent tabs: **Wallet, Trade and Earn**.

- **Wallet:** balance and 24-hour movement; Transfer, Deposit, Withdraw and Exchange; asset balances; DeFi Account entry; transaction history; prominent Earn promotions.
- **Trade:** search, a market heatmap, most-traded assets, top movers and an all-assets list. Asset pages include candlestick/timeframe controls, CoinMarketCap data and a current **Mira's notes** market-summary card.
- **Earn:** active/ended campaigns, asset APYs, daily crediting and detailed protocol/risk explanations. The Dollars campaign explicitly explains automatic USDT-to-USDe conversion, reinvestment, depeg risk and withdrawal-rate effects.
- **Transfer:** optimized for person-to-person Telegram contact sends, with no fee and a claim flow for contacts without Wallet.
- **Funding:** Deposit offers P2P Express, P2P Market, stablecoins and external crypto. Withdraw offers bank card, P2P Express, P2P Market PRO, external wallet/exchange and **Telegram Stars for gifts and Mini Apps**.
- **Settings:** general settings, notifications, passcode, language/currency, verification and tiers. There is no visible Connections, App Permissions, Allowances or recurring-spend control center.
- **Notifications:** transaction and security notifications are mandatory; market, product, marketing, education and research categories are optional. This is a natural delivery surface for receipts from any future delegated-spend feature.
- **Tiers:** Base, Plus and Trader primarily reduce trading fees based on monthly volume.

The official Perpetuals deep link opened Wallet's Trade surface in this profile rather than a Perpetuals screen, so the live controls could not be verified here. Official product material still confirms isolated margin, leverage, TP/SL, margin adjustment and position resizing; any contest pitch must distinguish itself from those controls.

## Ideas that must not be presented as new

These exist in Wallet or have direct Telegram competitors:

- Basic contact sends, address-free payments, gift/claim links, cheques or a prettier transfer card.
- Generic invoices, multi-user collection, donation goals, paid subscriptions or basic escrow.
- A plain group expense splitter, shared savings pot or multisig vault.
- Basic portfolio P&L, price charts, candlesticks, heatmaps or trade-result sharing.
- Generic swaps, staking/Earn, copy trading, limit orders, sniping or a trading bot.
- Tokenized stocks, ETFs, metals, pre-IPO exposure or more perpetual pairs as the whole idea.
- Rewards points, leaderboards, squads, referrals or quests without a new utility model.
- A generic AI assistant: My Wallet already advertises an AI Agent, and Wallet has announced an AI support assistant.

## Emerging-product and adoption scan

The relevant benchmark is not limited to large exchanges. Recent consumer products show where actual product attention is moving. User and volume figures below are provider or investor claims unless independently audited.

| Emerging product/direction | Recent utility gaining attention | Signal for Wallet | Important caveat |
| --- | --- | --- | --- |
| fomo | Social feed tied to observable trades, trader profiles, alerts, trade theses, multichain/gasless execution and one-click funding | Financial actions become content and identity, not a separate terminal | Wallet already has Squads and share cards; generic social trading is no longer original |
| FOMO (Telegram perp product) | “Smart Sentiment” filters onchain traders by an advertised 90-day profitability history and converts behavior into a simpler signal | Proof-backed context is more useful than anonymous tips | Signal products can encourage herding and need transparent methodology |
| KAST and the stablecoin-neobank wave | Local bank rails, stable balances, cards, payments and yield presented as one everyday-money product | Users value crypto most when chain mechanics disappear | Cards/local rails are licensing- and region-heavy and are not inherently Telegram-native |
| LINE NEXT Unifi | Stablecoin wallet connected to mini apps, missions, gaming, social and content utility | Messenger distribution can turn a wallet into an app-economy balance | Rewards/missions alone overlap Wallet Rewards and Telegram Stars patterns |
| Rumble Wallet | Native creator tipping and audience payments inside a content network | Payments work best at the moment of social interaction | Telegram already has bots, Stars, gifts, subscriptions and competing payment tools |
| tether.wallet | Self-custodial stablecoins, gold and Bitcoin/Lightning positioned for broad global access | Simple stable-value storage and movement remain powerful | Asset support alone would be a commodity suggestion |
| Bitget Wallet's 2026 redesign | A Pay hub unifying card, QR, bank-transfer and shopping paths | Everyday utility benefits from one obvious home, not scattered features | Depends on regional payment infrastructure and may not fit contest scope |
| Agentic-payment ecosystem | Scoped wallet permissions, programmable budgets and “know your agent” identity are emerging around autonomous commerce | Telegram bots and mini apps create a natural distribution surface for permissioned agents | “AI wallet assistant” is generic; the defensible unit is auditable authority and limits |
| Prediction/event apps | Discussion, news and real-world outcomes become tradeable, shareable objects | Telegram channels already host the conversation before market action | Regulatory exposure is high and prediction markets are an obvious contest theme likely to repeat |

### What appears widely appreciated

- **Less chain friction:** one balance, gas abstraction, routes selected automatically and fast local off-ramps.
- **Proof instead of claims:** visible trader history, performance context, transaction simulation and explainable risk signals.
- **Action at the social moment:** tipping, sending with a message, trading from a feed, or acting directly from shared content.
- **Everyday money behavior:** local transfers, cards, stable denomination, saving and paying without crypto vocabulary.
- **Controlled automation:** users increasingly accept automation when budgets, permissions, limits, pause controls and history are explicit.
- **Personalized discovery:** feeds and alerts based on people or topics a user follows, rather than a generic token leaderboard.

These signals do **not** automatically become contest ideas. They are ingredients. The winning mechanism must exploit Telegram's graph and Wallet's execution layer while avoiding the copied surface feature.

## Established-product feature comparison

| Product | Confirmed feature | Transferable lesson | Why copying it alone loses originality |
| --- | --- | --- | --- |
| Binance | Recurring buys, portfolio plans, execution limits, a plan simulator and 2026 sentiment-adjusted Smart DCA | Automation with transparent rules and history | DCA is mature and widely copied; even sentiment adjustment now exists |
| Binance | Recurring sends to users or allowlisted onchain addresses | Scheduled money movement | A schedule alone is commodity functionality |
| Robinhood | Recurring crypto/stocks and price/indicator alerts | Make investing habitual and event-driven | Common brokerage feature; weak Telegram differentiation |
| Revolut | Personal/group Pockets, recurring funding and spare-change roundups | Goals and mental accounting improve everyday usefulness | Savings pots and group goals already have close substitutes |
| Coinbase | Address-book allowlisting with a 48-hour safety delay | High-friction controls can prevent account takeover losses | Valuable safety control but not a winning concept by itself |
| Phantom | Transaction simulation, malicious-app warnings and automatic spam-token/NFT filtering | Explain the real outcome before an irreversible action | Simulation is an industry baseline in self-custody wallets |
| MetaMask | Security alerts using transaction/signature simulation and threat intelligence | Contextual risk beats generic education | Again a baseline unless made uniquely Telegram-aware |
| My Wallet | 11 chains, swap aggregation, gas-free sends, multiple accounts/subwallets, bulk transfers, gifts/NFTs, PnL, pinned tokens and an AI Agent | Advanced users value control and asset organization | Most surface-level wallet ideas already exist here |
| xRocket | Funding/trading balances, P2P, limit trading, cheques, multi-payment invoices, subscriptions, pay/exchange APIs and recovery via a linked self-custodial wallet | Telegram-native commerce is already crowded | Invoice/escrow/subscription pitches will appear derivative |

## Whitespace worth investigating

These are research hypotheses, not final recommendations:

### 1. Telegram-aware safety layer — excluded after comment review

The live thread contains several detailed Guardian/Safety Center/health-check proposals. This direction is now too crowded to lead our entry.

### 2. Intent-to-action cards

Telegram conversations contain financial intent: “pay me Friday,” “buy if BTC reaches X,” “split this,” or “send everyone their share.” Converting a message into a reviewable Wallet action could be powerful, but each action class already has competitors. The novelty would have to be a safe, permissioned intent layer rather than one isolated payment feature.

### 2A. Verifiable “shared thesis” objects

A channel post or message could carry a structured, time-stamped thesis—asset, horizon, invalidation level, risk cap and author position—rather than an unverifiable signal screenshot. Followers would see subsequent outcomes and could create their own bounded action without giving the author custody or copy-trading control. This borrows the appreciated parts of fomo's social identity and FOMO's proof-backed sentiment, but adapts them to Telegram's existing channel culture. It also has serious manipulation, privacy and regulatory risks. Comment duplication must be checked before promotion.

### 2B. Wallet Spend Pass

Instead of an unrestricted “AI agent,” a user grants a verified bot or Mini App a short-lived, revocable allowance: permitted action, maximum amount per use, total period cap and expiry. The live audit shows that Wallet already routes funds to Telegram Stars for gifts and Mini Apps, but has no visible permission or allowance center. The concept must therefore be an authorization layer—not another payment rail—and must respect Telegram's Stars rules for digital goods while using TON/DeFi permissions only where platform rules allow.

### 3. Explainable automation for ordinary users

Recurring investing is common. A more defensible angle could combine goals, scenario previews, guardrails, automatic pauses and a plain-language audit trail inside Telegram. It fits Wallet's broad asset set and beginner-to-advanced funnel, but Binance's simulator and Smart DCA substantially raise the originality bar.

### 4. Recovery and mistake prevention as a product journey

Wallet says it handled many mistaken-deposit recovery cases and warns users to make test transactions. A product could turn destination verification, test sends, network/memo checks, recovery evidence and support handoff into one coherent flow. This may create broad value, but claims and feasibility require support-team data unavailable publicly.

## Current ranking after live comments and app inspection

1. **Wallet Spend Pass** — strongest Telegram-native gap found in the live app; emerging permissions trend, exact placement and clear safety model.
2. **Wallet Promise Lock** — strongest originality/value alternative for Perpetuals; protects against behavioral risk rather than malicious transactions.
3. **Wallet Private Proofs** — distinctive privacy primitive for Telegram commerce, but technically and legally harder to explain.

Guardian, DCA/rebalancing, generic direct Mini App payment, escrow, tax, AI copilot and social trading are excluded because they are already live, standard elsewhere or represented in the contest discussion.

## Remaining evidence before submission

- Verify the final Spend Pass mechanics against Telegram Stars and blockchain Mini App rules.
- Recheck new contest comments immediately before drafting so a later entrant has not copied the same mechanism.
- Write the uneditable comment and design presentation images showing the real Wallet placement rather than decorative marketing art.

## Primary sources

- [Contest post](https://t.me/cryptowallet_news_en/838)
- [Wallet News](https://wallet.tg/news)
- [Wallet: where to start](https://help.wallet.tg/article/113-wallet-where-to-start)
- [Binance Smart DCA announcement](https://www.binance.com/en/support/announcement/detail/e653977d6dda42d390b50a20a33ec7c2)
- [Binance Convert Recurring](https://www.binance.com/en-JP/support/faq/detail/5026705ac87942069b1bdcf5a99ffc48/)
- [Binance Recurring Send](https://www.binance.com/en-ZA/support/faq/detail/07961294b40e4e9aa2894b0484c15954)
- [Robinhood recurring investments](https://robinhood.com/us/en/support/articles/recurring-investments/)
- [Robinhood price alerts](https://robinhood.com/us/en/support/articles/price-alerts/)
- [Revolut Pockets](https://help.revolut.com/help/app-features/vaults/how-do-i-put-money-into-vaults/)
- [Coinbase address allowlist](https://help.coinbase.com/en/coinbase/managing-my-account/other/address-book-allowlist)
- [Phantom transaction simulation warning](https://help.phantom.com/articles/43483612411411)
- [MetaMask security alerts](https://support.metamask.io/ja/configure/wallet/how-to-turn-on-security-alerts/)
- [My Wallet](https://mywalleet.io/)
- [xRocket wallet features](https://help.xrocket.exchange/hc/xrocket/articles/1782500294-wallet-features)
- [fomo product site](https://fomo.builders/)
- [fomo February 2026 product recap](https://fomo.family/blog/february-2026-recap)
- [FOMO Telegram product documentation](https://docs.onfomo.com/)
- [KAST](https://www.kast.xyz/)
- [LINE NEXT Unifi launch](https://lps-editor-2050.landpress.line.me/en/pr/news/global/20260309/)
- [Rumble Wallet launch](https://tether.io/news/tether-and-rumble-launch-rumble-wallet-bringing-self-custodial-crypto-payments-to-millions-of-creators-and-users/)
- [tether.wallet launch](https://tether.io/news/tether-launches-tether-wallet-the-peoples-wallet-extending-its-global-financial-infrastructure-directly-to-billions-of-users-left-behind-by-the-traditional-financial-system/)
- [Galaxy research on social trading](https://www.galaxy.com/insights/research/social-trading-fomo)
