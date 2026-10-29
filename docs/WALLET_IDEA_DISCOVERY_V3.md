# Wallet Ideas Discovery V3

**Research date:** 15 September 2026  
**Status:** Candidate discovery after live comment review. No submission has been posted.

## Research basis

- Live review of the discussion attached to Wallet News post 838 in Telegram Web.
- The thread displayed **408 comments**. Telegram's count includes replies and non-entries; 45 distinct loaded messages containing `#WalletIdeas` were treated as candidate submissions. Deleted comments and future submissions cannot be audited.
- 242 official Wallet News posts from 1 September 2025 through 15 September 2026.
- Wallet's current help documentation, including transaction warnings, P2P, Wallet Pay, account statements and Enhanced Due Diligence.
- Recent products and utilities: MetaMask Agent Wallet and Advanced Permissions, Coinbase spend permissions, Binance agent controls, fomo, FOMO, KAST, Ramp Network Wallet, Prson, emerging risk-enforcement tools and stablecoin apps.

## Live discussion exclusion map

The following themes are already represented in the contest comments and should not be submitted as our core idea:

- AI portfolio copilot, natural-language trading or AI market analysis.
- Transaction Guardian, transaction simulation, contract/address warnings, security score, emergency freeze or wallet health check.
- Recurring buy/DCA, conditional orders, automatic rebalancing, goal-based investing or smart vaults.
- Copy trading, social trading, trader groups, whale alerts or community insights.
- Group bill splitting, savings circles, shared financial goals or community treasury management.
- Escrow for freelancers, milestone payments, deal reputation or Trust Profiles.
- Crypto cards, QR merchant payment, auto-conversion, local bank cash-in/out or remittances.
- Crypto-backed loans or pay-later.
- Tax center, transaction exports or generic portfolio analytics.
- Direct payments to Telegram apps, gift links, subscriptions, creator rewards or task-to-earn campaigns.
- Broader multichain swaps, Web3-wallet linking, more RWAs, more DeFi or a standalone Wallet mobile app.
- Hedge mode, independent perpetual positions, limit orders, partial close or advanced trading UI.
- Digital identity/passport as a general profile, event tickets, loyalty cards, memberships or proof of ownership.

## New candidate 1: Wallet Spend Pass

### One-line concept

Give a verified Telegram bot or Mini App a small, revocable spending mandate instead of approving every repeat purchase or granting open-ended access.

### User problem

Telegram now contains games, stores, creator tools and emerging AI agents. One-off confirmation is safe but repetitive; unrestricted automation is convenient but dangerous. Users need a middle state: **“this bot can do only this much, for this purpose, until this time.”**

### Example flow

1. A verified Mini App requests a Spend Pass: `up to 100 Stars per purchase / 500 Stars per week / valid for 7 days`.
2. Wallet shows the bot identity, purpose, permitted action, funding/conversion policy, maximum single payment, period cap and expiry.
3. The user can reduce any limit before approval.
4. Eligible payments happen within those rules. Anything outside them returns to Wallet for explicit confirmation.
5. Wallet sends a compact receipt after every use and provides `Pause`, `Revoke` and `Dispute` controls from the same chat.
6. A universal **Spend Passes** screen shows every active bot, remaining allowance, next expiry and complete usage history.

### Safety rules

- Off by default; no blanket “access my Wallet” permission.
- Verified bot/merchant identity and immutable domain/bot binding.
- Separate limits for amount, asset, recipient, action type, frequency and time.
- No Perpetuals, withdrawals, seed access or permission re-delegation in V1.
- Default short expiry; reauthorization required after bot ownership or identity changes.
- Instant revoke; suspicious activity automatically pauses the pass, not the entire Wallet.

### Why it is not the submitted “Direct Payment to Telegram Apps” idea

That comment proposes a simpler one-time payment route—and the live Wallet already exposes `Withdraw -> Telegram Stars -> Pay for gifts and Mini Apps`. Spend Pass is an **authorization and control layer for bounded repeated actions**. Its product object is the revocable mandate, not the payment button or currency rail.

### Fit with the live app

- Add `Spend Passes` under `Withdraw -> Spend on Telegram`, beside the existing Telegram Stars path.
- Add `Apps & permissions` in account settings; none is visible today.
- Deliver a mandatory receipt after every use through Wallet's existing transaction/security notification channel.
- Use Stars for Telegram digital goods and Mini Apps where Telegram requires Stars. Use TON/DeFi permissions only for permitted blockchain actions.
- Keep person-to-person Transfer unchanged; it already solves contact sends and claim onboarding well.

### External validation and originality limit

MetaMask launched Agent Wallet with spend limits and protocol allowlists in August 2026; Coinbase documents token/time/amount spend permissions; Binance described separate agent balances and quotas in September 2026. Therefore delegated spending is an emerging utility, not globally original. The differentiation is making it a safe, human-readable permission primitive for Telegram's bot and Mini App economy.

### Contest score

| Depth | Value | Originality | Wallet fit |
| --- | --- | --- | --- |
| 9/10 | 9/10 | 7.5/10 | 10/10 |

**Current rank: 1.** Best balance of trend relevance, a verified live-product gap, Telegram culture, practical value and presentation potential.

## New candidate 2: Wallet Promise Lock

### One-line concept

A voluntary, server-enforced personal risk contract that prevents revenge trading and leverage escalation after a user's own limits are reached.

### User problem

Perpetuals already provide TP/SL and position controls, but those protect an individual position. They do not stop the behavioral loop of increasing leverage, opening another position or trying to win losses back. Research from the UK FCA found that trading-app engagement patterns can increase trading frequency and risk-taking, while newer trader tools are gaining interest around daily-loss locks and cooldowns.

### Example flow

Before a trading session, the user can set:

- maximum daily loss,
- maximum leverage,
- maximum number of new positions,
- cooldown after consecutive losses,
- session end time,
- optional trusted-contact accountability notification with no financial details.

Once activated, risk can be reduced immediately but cannot be increased until the chosen reset time. If a limit is reached, Wallet prevents new risk while still allowing position reduction, closing and withdrawals. The next day, a private recap shows which rule triggered and how much additional risk was avoided—without celebratory trading gamification.

### Why it is not Transaction Guardian or Safety Center

Those submitted ideas detect malicious recipients, contracts, approvals and compromised accounts. Promise Lock protects the user from **behavioral execution risk in legitimate markets**. It is closer to a seat belt for Perpetuals than antivirus for the wallet.

### Why Wallet could lead

Most mainstream crypto interfaces offer position-level risk tools but still optimize for more activity. Wallet can differentiate through user-chosen, enforceable guardrails—especially relevant after adding Perpetuals, Rewards and social Squads.

### Contest score

| Depth | Value | Originality | Wallet fit |
| --- | --- | --- | --- |
| 9/10 | 8/10 | 8.5/10 | 9/10 |

**Current rank: 2.** More original than Spend Pass and socially responsible, but it serves active traders rather than the entire Wallet audience. The live Perpetuals screen was not available in the inspected profile, so exact UI placement relies on official product material.

## New candidate 3: Wallet Private Proofs

### One-line concept

Let users prove one fact—such as sufficient funds, successful payment or eligibility—without revealing their balance, full history, identity documents or wallet address.

### User problem

Telegram deals and communities rely on screenshots that can be forged and often expose too much. A buyer may need to prove that they can cover 500 USDT; a seller may need to prove a refund was sent; a community may need to check that a person is unique or eligible. Persistent public reputation creates profiling and privacy risks.

### Example proofs

- `Balance is at least 500 USDT`—without revealing the balance.
- `This Wallet account passed the required verification tier`—without sharing identity documents.
- `Payment X was completed to the named counterparty`—without exposing unrelated history.
- `One eligible participant, one claim`—without publishing the user's Wallet address.
- `Active Wallet user for more than one year`—without displaying transaction volume.

Each proof is user-created, purpose-bound, recipient-bound, short-lived and revocable where technically possible. A Telegram message displays a Wallet-verified card that anyone can validate but cannot edit or reuse for another purpose.

### Why it is not the submitted Trust Profile

The Trust Profile proposal creates a persistent public reputation based on ongoing activity and feedback. Private Proofs disclose **one minimum fact for one interaction** and deliberately avoid rankings, balances and permanent social scoring.

### Trend evidence

Selective-disclosure credentials and privacy-preserving proof wallets are moving from research into consumer experiments. Prson, for example, markets atomic signed claims and purpose-specific proof challenges. The model is relevant, but Wallet would need a careful cryptographic and legal design.

### Contest score

| Depth | Value | Originality | Wallet fit |
| --- | --- | --- | --- |
| 8/10 | 7.5/10 | 9/10 | 8.5/10 |

**Current rank: 3.** Most intellectually distinctive, but harder to explain quickly and easiest to overpromise technically.

## Additional reserve ideas

### Wallet Money Inbox

A single inbox for verified invoices, refund notices, payment requests, subscriptions and expiring claims received across Telegram bots and chats. It would expose identity, amount, due date, status and `Pay / Snooze / Decline / Report` controls. This differs from creating invoices: it solves recipient-side overload and phishing. Useful but less transformational than Spend Pass.

### Wallet Context Receipt

Create a structured, consented receipt that binds a transfer to its purpose, counterparty and originating Telegram message. This could reduce later screenshot collection for support, reconciliation and Enhanced Due Diligence. It is practical, but it sits too close to the already-submitted ProofPay and Tax Center concepts to lead the entry.

## Recommendation

Develop **Wallet Spend Pass** as the primary concept, with **Promise Lock** as the strongest alternative.

Spend Pass is the better presentation story:

`Bot asks for unlimited access` → `Wallet converts the request into a bounded mandate` → `small approved actions run smoothly` → `anything outside the rules stops` → `one-tap revoke and complete audit trail`.

The pitch must not call it an “AI assistant,” “direct app payment” or generic “spending limit.” Its differentiator is a new Wallet object: **a granular, expiring permission card for Telegram bots and Mini Apps**, layered over the existing Stars/Wallet rails.

## Sources

- [Contest post](https://t.me/cryptowallet_news_en/838)
- [Wallet Pay API](https://docs.wallet.tg/pay/)
- [Telegram blockchain and Mini App guidelines](https://core.telegram.org/bots/blockchain-guidelines)
- [Wallet transaction warnings](https://help.wallet.tg/article/666-transactions)
- [Wallet Enhanced Due Diligence evidence requirements](https://help.wallet.tg/article/646-enhanced-due-diligence)
- [MetaMask Agent Wallet](https://metamask.io/news/introducing-metamask-agent-wallet)
- [MetaMask Advanced Permissions](https://metamask.io/en-GB/news/introducing-advanced-permissions)
- [Coinbase Spend Permissions](https://docs.cdp.coinbase.com/wallets/using-wallets/spend-permissions)
- [Binance Agentic Wallet Controls](https://www.binance.com/en/blog/tech/7276731523787720812)
- [FCA research on trading-app design](https://www.fca.org.uk/news/press-releases/fca-keeps-trading-apps-under-review-over-gaming-concerns)
- [Prson selective identity proofs](https://app.prson.net/)
- [Telegram blockchain guidelines](https://core.telegram.org/bots/blockchain-guidelines)
