# Wallet Ideas Contest Research

> **Current status:** Neither Deal Rooms nor Wallet Plans is recommended for submission. Both recommendations are withdrawn pending competitor and unmet-need validation. [Existing-feature audit](WALLET_EXISTING_FEATURE_AUDIT.md) is the current research baseline; the historical update below is superseded.

> **Research update — 10 September 2026:** The initial Deal Rooms recommendation and numerical rankings below are superseded. Further research found close escrow competitors and Telegram-native precedents. Read [the revised recommendation](WALLET_IDEAS_RESEARCH_V2.md) for the current selection, Wallet Plans, its prior art, practical limits, and proposed entry. The original material is retained as research history, not a verified implementation plan. In particular, separate Wallet custody products and merchant APIs cannot be assumed to supply a reusable consumer escrow backend; digital-goods proposals must respect Telegram Stars rules.

## Executive conclusion

The strongest entry is **Wallet Deal Rooms**: a Telegram-native protected transaction flow that turns an ordinary chat into a structured, conditional payment. A buyer and seller agree on an amount, deadline, deliverable, and optional milestones; funds are locked; both parties follow the deal through a pinned status card; and funds are released, refunded, or escalated according to transparent rules.

This is stronger than another asset, chart, AI assistant, or generic portfolio feature because it uses Wallet's hardest-to-copy advantage: money, identity, negotiation, and delivery already meet inside Telegram. It also extends capabilities Wallet already operates—contact transfers, one-time escrow, P2P escrow, Wallet Pay, verification, and TON smart contracts—rather than requiring an unrelated product.

The recommended entry should not promise unrestricted global escrow. The credible version starts with verified users, supported assets, transaction caps, eligible deal categories, and a limited-market pilot. That makes the idea ambitious without ignoring compliance, fraud, or dispute-operation realities.

## Contest brief

The announcement asks for a new Wallet feature or direction and says the team will score entries on depth, value, originality, and fit. Three winners receive 500 USDT each. The entry must be posted as a comment under the announcement, include `#WalletIdeas`, and be submitted by 23:59 UTC on 30 September 2026. Comments cannot be edited after posting.[^1]

The general giveaway terms add several important conditions: participation normally requires a Crypto Wallet account with at least Basic verification; only one participation per user is permitted unless an announcement expressly says otherwise; manipulation, coordinated participation, multiple accounts, or automation can disqualify an entry; and the specific announcement controls the qualifying action.[^2]

Practical implication: submit one complete comment only after a final copy check. Do not post a placeholder, an unfinished version, or several competing ideas from the same account.

## Product context

Wallet is no longer a simple Telegram payment bot. Its custodial Crypto Wallet is positioned for ease and everyday use, while DeFi Account is a self-custodial TON wallet for on-chain ownership and applications. The two products sit in one Telegram experience but have distinct providers, custody models, feature sets, and legal boundaries.[^3]

Crypto Wallet currently supports a broad financial surface: hundreds of multi-chain assets, transfers to Telegram contacts, spot trading, Earn products, P2P trading, tokenized stocks and ETFs, and perpetual futures. Wallet says Perpetuals expose more than 50 markets with leverage up to 50x, while its product overview lists 214 multi-chain assets, 68 tokenized stocks, and four tokenized ETFs.[^3][^4] Crypto Wallet also shows total and per-token investment returns, so a simple "add P&L" proposal would duplicate an existing feature.[^5]

DeFi Account provides self-custody, TON tokens and NFTs, dApp access, swaps, Earn integrations, direct transfers to Telegram contacts, and cross-chain funding routes. Wallet's contact-transfer flow already uses a one-time escrow smart contract: the recipient can accept or reject, and unclaimed transfers return after 14 days. It does not, however, define a purchase, delivery condition, milestone, or buyer-seller dispute workflow.[^6]

Wallet Pay is a separate business product. Its API lets an approved merchant create an order for a specific Telegram user, receive payment through Wallet, process webhooks, and issue refunds. Merchant funds are held for 48 hours by default before withdrawal. Access requires a merchant account and questionnaire plus KYB or KYC review.[^7] This proves that Wallet already has merchant checkout and settlement primitives, but it does not give two ordinary users a protected, chat-native deal flow.

Wallet's scale makes this gap meaningful. Wallet and TOP reported more than 150 million registered users in 2026, while TOP frames Telegram's billion-user distribution as its strategic advantage.[^4][^8] The adjacent Telegram creator economy is already material: TOP reported that Tribute served 1.35 million unique paying users and processed more than $52 million in 2025.[^9]

A recent Wallet channel post also clarifies the product direction: Telegram's new Gram wallet is the simple entry point, while Wallet is intended for users ready for trading, Earn, tokenized assets, and active financial management. Wallet says it is preparing a major update to bring the products closer.[^10] A protected commerce layer fits this progression: first hold and send money, then use it safely in real economic relationships.

## Competitive landscape and whitespace

| Product | What it already does | What remains open for Wallet |
|---|---|---|
| Crypto Wallet / DeFi Account | Contact transfers, asset trading, Earn, P2P, Wallet Pay, and a one-time accept/reject escrow for contact transfers | No structured buyer-seller agreement, milestone release, proof-of-delivery state, or reusable deal record in the chat |
| Binance Pay | Crypto transfers and split-bill requests; Binance Chat adds groups, portfolio sharing, Red Packets, and paid groups | Users must move into Binance's own app/social graph; split bills are requests, not protected commerce[^11] |
| Revolut Group Bills | Groups, shared-expense tracking, custom splits, and settlement | Fiat-centric expense coordination, not Telegram-native conditional crypto settlement[^12] |
| Splitwise | Shared ledgers for trips, households, friends, and settlement through supported payment rails | Tracks debt well but is not a wallet, escrow, or native Telegram payment rail[^13] |
| Tonkeeper Pro / TON multisig | Multisignature wallets, multi-send, multi-account management, and shared custody for teams | Treasury administration rather than a consumer buyer-seller deal flow; configuration is designed for advanced users[^14] |
| Telegram expense/DAO bots | Small products demonstrate demand for group expense tracking and Telegram-native treasuries | Fragmented trust, separate onboarding, small distribution, and no first-party Wallet identity or support layer[^15] |

The comparison suggests two traps. First, **bill splitting alone is not original**: Binance Pay, Revolut, Splitwise, and Telegram bots already do it. Second, **multisig alone is not original**: TON supports it and Tonkeeper Pro already packages it. The differentiator must be the complete protected-deal lifecycle embedded in the conversation where a transaction is negotiated.

## Shortlist

Scores use the four published judging criteria plus execution credibility. They are analytical judgments, not predictions of Wallet's internal scoring.

| Candidate | Depth | Value | Originality | Wallet fit | Execution credibility | Total / 50 |
|---|---:|---:|---:|---:|---:|---:|
| Wallet Deal Rooms | 10 | 10 | 9 | 10 | 7 | **46** |
| Wallet Circles: shared group funds, bills, and approvals | 9 | 9 | 7 | 10 | 8 | 43 |
| Wallet Shield: pre-transfer risk and identity signals | 8 | 10 | 7 | 10 | 8 | 43 |
| Wallet Lens: unified performance and risk dashboard | 9 | 9 | 6 | 10 | 9 | 43 |
| Agentic Wallet Autopilot | 9 | 8 | 5 | 9 | 6 | 37 |

### Why the alternatives rank lower

**Wallet Circles** is useful, but Splitwise, Revolut, Binance Pay, Tonkeeper multisig, and multiple Telegram bots occupy much of the obvious solution space. It becomes distinctive only when expanded into a broad shared-finance operating system, which makes a contest comment harder to keep focused.

**Wallet Shield** addresses a severe problem. Wallet's own help center repeatedly warns about impersonation, fake support, suspicious links, and irreversible transactions, and public reviews frequently complain about fraud or opaque support outcomes.[^16] The general need is beyond dispute: the FBI recorded 61,559 cryptocurrency-investment-fraud complaints and $7.228 billion in reported losses in 2025.[^17] However, transaction simulation and scam warnings are now expected wallet features. Shield works better as a layer inside Deal Rooms than as the headline idea.

**Wallet Lens** fits the current workspace and could become a strong prototype. But Crypto Wallet already displays investment returns, and Tonkeeper Pro already markets advanced analytics and multi-wallet management.[^5][^14] A version that unifies Crypto Wallet, DeFi Account, Earn, Perpetuals, XStocks, and collectibles could still be valuable, but its originality case is weaker.

**Agentic Wallet Autopilot** sounds current, but TON Tech announced an open Agentic Wallet standard in April 2026. It already covers dedicated agent wallets, user-defined limits, revocable access, autonomous payments, trading, and DeFi actions.[^18] Repackaging that announcement would look derivative unless attached to a very specific use case.

## Recommended solution: Wallet Deal Rooms

### The user problem

Telegram often hosts the full commercial conversation: discovery in a channel or group, negotiation in direct messages, delivery through chat, and support afterward. The payment step remains unsafe or fragmented. A direct crypto transfer is fast but effectively irreversible; P2P escrow is designed for fiat-to-crypto exchange; Wallet Pay is designed for approved merchants; and external escrow platforms force both parties out of the conversation.

This creates a trust gap for freelancers, creators, small merchants, community members, ticket or collectible buyers, and ordinary users transacting with someone they do not yet trust. Consumer-protection authorities explicitly warn that crypto payments are difficult to reverse and that person-to-person payment systems are attractive to scammers.[^19]

### Core experience

1. In a one-to-one Telegram chat, either party opens the attachment menu and selects **Wallet > Create Deal**.
2. The creator enters a title, amount and supported asset, deliverable, deadline, and release structure: one-time or milestones.
3. The counterparty reviews the terms and identity/risk summary. Both accept the same immutable deal version.
4. The buyer funds the deal. Funds move to a one-time escrow contract in DeFi Account, or to a compliant protected-balance flow in Crypto Wallet where available.
5. Telegram pins a compact deal card in the chat: `Agreed -> Funded -> Delivered -> Released`, with deadline and action buttons.
6. The seller marks a milestone delivered and attaches evidence or a Telegram message reference. The buyer releases it, requests a revision, or opens a dispute.
7. Clear timeout rules handle inactivity. Mutual cancellation refunds automatically. Disputes enter a structured evidence flow and, where supported, human or approved third-party arbitration.
8. On completion, both parties receive a receipt and an optional private reputation credential. Public balances and transaction histories are never exposed.

### Safety and trust layer

- Show the exact recipient and deal terms again before funding.
- Display privacy-preserving signals such as verified Wallet status, approximate account age band, completed-deal band, dispute rate band, and known-risk warnings. Do not expose contact graphs, balances, or raw personal data.
- Freeze the agreed terms after both parties accept; every amendment creates a new version requiring both approvals.
- Scan links and connected apps, simulate on-chain effects, and explain permissions in plain language before signature.
- Separate **counterparty risk**, **asset volatility**, **smart-contract risk**, and **Wallet/provider custody** so users understand what protection does and does not cover.
- Start with transaction caps, verified users, supported assets, eligible jurisdictions, and prohibited-category enforcement.

### MVP and roadmap

**MVP**

- Verified users only
- USDT and GRAM
- Fixed-price and up to three milestones
- Mutual release/cancel plus simple deadline rules
- Immutable in-chat deal card and downloadable receipt
- Pilot in one or two supported markets and a narrow set of eligible goods/services

**Phase 2**

- Approved arbitrators and transparent dispute service levels
- Seller profiles and private reputation credentials
- Group purchases and deposits
- Wallet Pay API for bots and merchants to create Deal Rooms

**Phase 3**

- Recurring retainers and subscriptions where permitted
- Shipping or delivery integrations
- Optional insurance/reserve products through regulated partners
- Cross-border settlement and local off-ramp routing in supported markets

### Why Wallet can win this category

Wallet already owns the high-friction parts of the journey: Telegram identity, contact selection, payment confirmation, supported assets, self-custodial TON contracts, custodial settlement, merchant APIs, and a large installed base. Competitors usually own only one piece—chat, expense tracking, escrow, wallet infrastructure, or merchant acquiring.

Deal Rooms turns Wallet from a place used after a deal is negotiated into the trusted transaction layer of the conversation itself. That is strategically stronger than copying another exchange feature and is more defensible than adding a standalone bot.

### Success metrics

- Deal funding volume and number of funded deals
- Completion rate and median time to completion
- Dispute rate, loss rate, and median dispute-resolution time
- Repeat buyer-seller pairs within 30 and 90 days
- Share of funded deals initiated from the Telegram attachment menu
- New verified Wallet activations attributable to a received Deal Room
- Net losses prevented versus comparable direct transfers
- User trust and post-deal satisfaction, measured separately for buyers and sellers

## Ready-to-post contest comment

> **Wallet Deal Rooms — protected payments built into Telegram chats.**
>
> Telegram is already where people discover sellers, negotiate freelance work, buy community services, and receive the final deliverable. But at payment time they must choose an irreversible transfer, P2P escrow meant for fiat/crypto exchange, or an external platform. Wallet could close that trust gap.
>
> From the attachment menu, either person creates a Deal Room with the amount, asset, deadline, deliverable, and optional milestones. Both accept the same immutable terms; the buyer funds USDT or GRAM into a one-time escrow; and a pinned chat card tracks `Agreed -> Funded -> Delivered -> Released`. The seller submits delivery or milestone evidence in the chat. The buyer releases funds, requests a revision, or opens a structured dispute. Mutual cancellation and clear timeouts trigger automatic refunds.
>
> Before funding, Wallet shows privacy-safe trust signals—verified status, completed-deal band, dispute-rate band, and risk warnings—without revealing balances or private history. Start with verified users, transaction caps, supported markets, and eligible deal categories; then add group purchases and a Wallet Pay API so bots and merchants can create Deal Rooms.
>
> Wallet already has contact transfers, P2P escrow, Wallet Pay, verification, and TON smart contracts. Deal Rooms connect those rails into something competitors cannot easily copy: protected commerce inside the conversation where the deal happens. It could help freelancers, creators, small merchants, and ordinary buyers while growing real USDT/GRAM payment volume.
>
> Success metrics: funded deals, completion/dispute rates, repeat counterparties, resolution time, and losses prevented. **#WalletIdeas**

## Compact version

> **Wallet Deal Rooms:** turn any Telegram chat into a protected transaction. Either person sets the amount, asset, deliverable, deadline, and milestones; both accept immutable terms; the buyer funds USDT/GRAM into escrow; and a pinned card tracks `Agreed -> Funded -> Delivered -> Released`. Delivery evidence stays in the chat. The buyer can release, request revision, or open a structured dispute; mutual cancellation and timeouts handle refunds. Add privacy-safe trust signals such as verified status, completed-deal band, and risk warnings. Start with verified users, caps, supported markets, and eligible deal types, then open a Wallet Pay API for bots and merchants. Wallet already has contact transfers, P2P escrow, Wallet Pay, verification, and TON smart contracts—Deal Rooms connect them into a Telegram-native commerce layer for freelancers, creators, merchants, and everyday buyers. **#WalletIdeas**

## Submission checklist

- Re-read the live announcement and giveaway terms immediately before posting.
- Confirm the posting account is eligible and has the required Crypto Wallet verification.
- Search the live comments for `escrow`, `deal room`, `milestone`, `protected payment`, `buyer protection`, and `freelance`.
- If a nearly identical idea already exists, differentiate the entry around the immutable in-chat contract, milestone workflow, privacy-safe reputation, and phased compliance plan rather than changing the entire concept.
- Paste once into a temporary local note, proofread the hashtag and deadline language, then paste into Telegram.
- Do not edit after posting; Telegram says edited comments are not allowed.
- Do not submit multiple entries from the same user unless Wallet explicitly changes the one-entry rule.

## Research limitation

The announcement, rules, official product documentation, competitor documentation, public reviews, and public Telegram channel were accessible. Telegram's public web preview did **not** expose the live comment thread for this post, and the linked public group exposes only its join page without authenticated message history. Therefore the concept was deduplicated against publicly searchable products and projects, but not against every contest comment already submitted. A final live-comment scan in the Telegram app is required before posting. A screenshot or export of the current comments would allow a precise final deduplication pass.

## Sources

[^1]: Wallet News, “[5 years of Wallet: a product shaped by your ideas](https://t.me/cryptowallet_news_en/838),” 10 September 2026.
[^2]: Crypto Wallet, “[Giveaway Campaigns — Terms & Conditions](https://wallet.tg/docs/giveaway_campaigns),” updated 7 September 2026.
[^3]: Wallet in Telegram, “[Crypto Wallet vs. DeFi Account: What’s the difference?](https://wallet.tg/news/crypto-wallet-vs-ton-wallet-what-s-the-difference),” 25 July 2025.
[^4]: Wallet in Telegram, “[Wallet launches perpetual futures for 150M+ users with Lighter](https://wallet.tg/news/wallet-in-telegram-launches-perpetual-futures-for-150-m-users-with-lighter),” 2 April 2026.
[^5]: Wallet Help Center, “[Crypto Wallet, Where to Start](https://help.wallet.tg/article/113-wallet-where-to-start),” accessed 10 September 2026.
[^6]: Wallet Help Center, “[Sending Tokens to Telegram Users](https://help.wallet.tg/article/233-send-tokens-to-telegram-users),” updated 18 August 2026.
[^7]: Crypto Wallet, “[Wallet Pay API](https://docs.wallet.tg/pay/),” version 1.2.0, accessed 10 September 2026.
[^8]: The Open Platform, “[The Open Platform receives billion-dollar valuation](https://top.co/insights/the-open-platform-becomes-the-first-unicorn-in-the-ton-based-ecosystem-in-telegram),” 3 July 2025.
[^9]: The Open Platform, “[Tribute becomes Telegram’s leading creator platform](https://top.co/insights/tribute-becomes-telegram-leading-creator-platform),” 6 March 2026.
[^10]: Wallet News, “[Gram wallet makes crypto easy to start](https://t.me/cryptowallet_news_en/834),” 4 September 2026.
[^11]: Binance, “[How to Create a Split Bill Request on Binance Pay?](https://www.binance.com/en-KZ/support/faq/detail/c9974c8dccac4a689133a102b4fe4f53),” updated 5 May 2026; Binance, “[Binance Chat User Guide](https://www.binance.com/en-BH/support/faq/detail/d740824099294553ab1e5d08d5d01bd8),” updated 4 March 2026.
[^12]: Revolut, “[What is Group Bills?](https://help.revolut.com/help/transfers/group-bills/question-group-bills/),” accessed 10 September 2026.
[^13]: Splitwise, “[How do I use Splitwise?](https://kb.splitwise.com/getting-started/how-do-i-use-splitwise),” accessed 10 September 2026.
[^14]: Tonkeeper, “[Tonkeeper Pro Now Available on iPhone](https://tonkeeper.com/en/article/tonkeeper-pro-now-available-on-iphone),” accessed 10 September 2026; TON Docs, “[Wallets comparison](https://docs.ton.org/contracts/standard/wallets/comparison),” accessed 10 September 2026.
[^15]: Tallycents, “[The Best Telegram Bot to Split Bills](https://tallycents.com/),” accessed 10 September 2026; Caerlower, “[StonMaker](https://github.com/Caerlower/StonMaker),” GitHub, accessed 10 September 2026.
[^16]: Wallet Help Center, “[Secure Your Trading Experience](https://help.wallet.tg/article/79-how-to-avoid-scam-when-using-p2p-service),” accessed 10 September 2026; Trustpilot, “[Wallet in Telegram Reviews](https://www.trustpilot.com/review/wallet.tg),” accessed 10 September 2026. Public reviews are anecdotal and are used only as directional evidence, not as verified incident counts.
[^17]: FBI Internet Crime Complaint Center, “[2025 IC3 Annual Report](https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf),” 2026. The figure covers reported U.S. cryptocurrency investment fraud, not Wallet-specific losses.
[^18]: The Open Platform, “[TON Tech introduces Agentic Wallets](https://top.co/insights/ton-tech-agentic-wallets),” 28 April 2026.
[^19]: U.S. Federal Trade Commission, “[Will your bank or investment fund stop a transfer to a scammer? Probably not](https://consumer.ftc.gov/consumer-alerts/2024/03/will-your-bank-or-investment-fund-stop-transfer-scammer-probably-not),” March 2024; FTC, “[Tips for using peer-to-peer payment systems and apps](https://consumer.ftc.gov/consumer-alerts/2018/02/tips-using-peer-peer-payment-systems),” February 2018.
