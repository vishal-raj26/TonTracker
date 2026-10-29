# Wallet contest: revised research and recommendation

> **Recommendation withdrawn, 10 September 2026.** Wallet Plans is not selected for submission. The Telegram-native competitor audit was incomplete when this recommendation was written. Read [the existing-feature audit](WALLET_EXISTING_FEATURE_AUDIT.md) first. The proposal below is retained as an exploratory draft; no novelty or winning-potential claim should be relied on.

Research date: 10 September 2026. Recommendation is product judgment, not proof of demand or a prediction of contest results. Public product documentation, support pages, terms, and competitor pages were reviewed. Private Telegram comments and competitor usage analytics were not obtained. No contest comment was posted.

## Decision

Recommend **Wallet Plans — Make “we should” happen.**

A group agrees on a purpose, target, deadline and recipient. Members reserve contributions in Crypto Wallet. At the deadline, the system transfers the reserved contributions to that recipient only if the target is fully funded and all eligibility checks pass. Otherwise it releases the reservations. The organiser cannot withdraw early or change the recipient after funding begins.

Start with private, small, verified groups making a collective money gift to a known recipient. This is deliberately narrower than a marketplace, public crowdfunding service, investment club, or purchase-protection scheme. Expansion into bookings and merchant payments requires separate integrations and review.

The opportunity is to make Wallet useful for something people already coordinate socially, with distribution through an actual shared task. It is not a claim to have invented shared pots or conditional funding.

## What further research ruled out

| Direction | Evidence and verdict |
|---|---|
| Deal Rooms / Handshake | [Exmon](https://exmon.pro/blog/exmon-escrow-launches-official-telegram-bot/240) and [Coinfreeze](https://coinfreeze.xyz/) advertise Telegram escrow. Their safety and adoption were not independently verified. Telegram already has [protected gift offers](https://telegram.org/blog/passkeys-and-gift-offers/tr?setln=en) and [conditional suggested-post payments](https://telegram.org/blog/checklists-suggested-posts/fa?setln=en). Generic escrow is less original than initially presented and disputes are expensive. |
| Wallet Receipts | [TradingView](https://www.tradingview.com/support/solutions/43000477695-i-d-like-to-edit-delete-my-idea-or-script/) already prevents ordinary editing/deletion of public ideas after 15 minutes. A complete, non-cherry-picked prediction history could be useful, but is not a new category. Thin samples, multiple accounts and off-platform calls complicate performance claims. |
| Social trading feed | [Phantom](https://phantom.com/learn/blog/social-feed-beta) already connects trading discovery with social activity. A new feed competes for attention rather than necessarily solving a payment problem. |
| Generic shared pot | [Revolut](https://help.revolut.com/help/app-features/vaults/what-are-revolut-vaults/), [PayPal](https://www.paypal.com/us/digital-wallet/send-receive-money/pool-money), and [Collctiv](https://www.collctiv.com/) already cover group collection. A renamed pot is insufficient. |
| AI wallet autopilot | [TON agentic wallets](https://top.co/insights/ton-tech-agentic-wallets) already address delegated execution and controls. “Add AI” is not a differentiated user problem. |

## Where Wallet Plans could differ

[Revolut's Irish personal terms](https://www.revolut.com/en-IE/legal/terms/) describe Group Pockets as owner-controlled, with access risks if the owner's account is locked. [Collctiv](https://www.collctiv.com/lp/collect-money-now) makes upfront collection easy and lets organisers withdraw; its [refund FAQ](https://www.collctiv.com/faqs/how-can-i-get-a-refund-if-i-change-my-mind) directs contributors to support before withdrawal. These are real competing solutions, not straw men.

[Kickstarter](https://help.kickstarter.com/hc/en-us/articles/115005028514-What-are-the-basics) already uses all-or-nothing pledges. Consequently the defensible proposal is this combination: **a private Telegram group, pre-reserved wallet balances, fixed recipient and rules, and deadline-based release or return**. This research does not establish that no other product has implemented the same combination.

Wallet's possible advantage is fewer context switches for existing eligible users. It is not automatically easier for newcomers: Collctiv accepts card contributions without an account, whereas Wallet verification and crypto funding can add friction. The first pilot should therefore recruit existing Wallet users, not assume mainstream adoption.

## Cultural fit without forced slang

The cultural insight is the familiar group-chat gap between agreeing to do something and actually funding it. That is a design hypothesis, not a measured Telegram-wide finding.

Telegram's [collectible gifts](https://telegram.org/blog/collectible-gifts-and-more/ms?setln=en) demonstrate that gifting and personal expression are supported product behaviours. Wallet's [Quests documentation](https://help.wallet.tg/article/983-loyalty-program-crypto-wallet-rewards) documents squad-based goals, although the first Quest period ended on 11 August 2026. This provides product context, not proof that users want shared money plans.

Suggested expression:

- Product: Wallet Plans. Working name; availability and trademarks not checked.
- Main line: **Make “we should” happen.**
- Campaign line: **The plan made it out of the group chat.**
- Interaction: “Chip in”, “View rules”, “Withdraw my contribution”.
- Completion: an optional greeting card with contributor-approved names and messages, never a wealth leaderboard.

Use local language, date formats, greetings and optional celebration artwork. Do not assume a single national culture or impose festival themes. No contribution streaks, shaming unpaid members, random prizes, or pressure to contribute more. Do not market the wording as a verified current viral trend; its strength is recognisable language.

## Practical first version

Illustrative flow: friends create a 100-USDT birthday money gift for an already verified friend. This is an example amount, not a financial recommendation.

1. Creator specifies the recipient, target and deadline. Recipient accepts participation before contributions open. The confirmation explains who receives money and when.
2. Each eligible participant explicitly authorises a reservation. Reserved funds cannot also be spent, traded, or placed in Earn. The interface distinguishes reserved from transferred.
3. Participants may withdraw before the deadline. Contributions cannot exceed the target. Funding the target early does not trigger early payment.
4. At the deadline, an atomic eligibility-and-balance check either transfers all committed funds to the fixed recipient or releases reservations. Concurrency, partial failure and duplicate delivery must be tested.
5. The group card shows aggregate progress; personal balances and contribution amounts stay private by default. A user must opt in to public recognition.

Creator cancellation releases reservations. Changing a recipient, target or deadline requires cancellation and a new plan, not an invisible edit. Removing someone from a Telegram group does not remove their financial rights. Account restrictions may require a held/review state: do not promise that regulatory holds can always be bypassed by automatic refunds. Once the recipient receives the gift, this mechanism does not control how it is spent or provide purchase protection.

Launch with one supported stablecoin in eligible markets, known recipients, contribution caps, anti-abuse checks and no public plan discovery. Stablecoins still carry issuer and depegging risk. No lending, yield, investment pooling, merchant checkout or automatic fiat conversion in version one.

## Feasibility boundaries

[Wallet's starting guide](https://help.wallet.tg/article/113-wallet-where-to-start) documents internal contact transfers but does not establish that conditional reservations exist. Wallet would need a new reservation ledger, consent records, scheduled settlement, reconciliation, fraud controls and legal approval. This is feasible as a proposed product architecture, not a confirmed ready-made API integration.

[Telegram's Bot API](https://core.telegram.org/bots/api#editmessagetext) supports updating bot messages. A shared status message linking into Wallet is a plausible interface. Do not assume a third party can add a new native Telegram composer button or read entire private chats. Wallet remains the authoritative financial state even if a chat message is deleted or stale.

Crypto Wallet and DeFi Account have [different custody models](https://wallet.tg/news/crypto-wallet-vs-ton-wallet-what-s-the-difference). Keep the pilot in one product. Do not imply a self-custodial smart contract and custodial internal balance are interchangeable. [Wallet Pay](https://docs.wallet.tg/pay/) is a merchant interface, not proof of a consumer group-reservation capability.

[Telegram requires Stars for digital goods and services sold through bots and mini apps](https://core.telegram.org/bots/payments-stars). The proposed pilot is a personal money gift, not a route around that requirement. Collectible purchases, paid communities, digital services and other commerce need explicit policy review before inclusion. The classification of even the pilot must be confirmed by Wallet's legal and platform teams.

## What would make it genuinely game-changing

The expansion hypothesis is repeated group coordination: gifts first, then eligible event and merchant payments, eventually reusable plans. Each completed plan might introduce Wallet to more people through a practical reason to participate. Neither repeat use nor conversion has been established by this desk research.

Validate with organiser and contributor interviews, then a prototype against a normal transfer link and a basic pot. Measure completion rate, time to collect, repeat organising within 60 days, contributor abandonment during verification, support contacts, and refund/release failures. Separate existing-user success from newcomer success. Agree pass/fail thresholds before the pilot rather than inventing impressive adoption numbers now.

Stop or simplify if people prefer unrestricted pots, deadlines cause too much friction, recipients cannot use the balance economically, or support and compliance costs overwhelm repeat usage. A high number of shares without completed and repeated plans would not validate the idea.

## Proposed contest comment — not submitted

**Wallet Plans — Make “we should” happen.**

Every group chat has a plan waiting to happen. Wallet could turn that agreement into a shared commitment.

Start with group money gifts: choose a recipient, target and deadline, then share a live card in the chat. Friends authorise contributions from their Wallet balances. Funds stay reserved until the deadline: if the target is met, the agreed recipient receives the gift; otherwise reservations are released. Contributors can withdraw before the deadline, and the organiser cannot cash out early or switch the recipient.

Make it feel like Telegram: an optional group greeting, reactions and a “we made it happen” card—without exposing balances or ranking friends by how much they paid.

Shared pots already exist. The difference would be clear commitment rules built into the conversation, rather than sending the organiser money and hoping the plan happens. This protects the collection process, not what the recipient does after receiving the gift.

Pilot with verified users, one supported stablecoin, small limits and clear handling of account restrictions. No pooled trading or yield. Measure completed plans and repeat use, not just invitations.

Wallet would gain a reason to be opened whenever people want to do something together—not only when they want to trade.

#WalletIdeas

Before submission: recheck the [original contest post](https://t.me/cryptowallet_news_en/838) and [giveaway terms](https://wallet.tg/docs/giveaway_campaigns), eligibility, deadline and no-edit rule. Read existing entries if accessible to check duplication. Public research cannot establish originality relative to comments that were not retrieved.
