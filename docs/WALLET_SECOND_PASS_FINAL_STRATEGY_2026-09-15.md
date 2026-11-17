# Wallet contest second pass: concepts, finalists and final decision

Research cutoff: 15 September 2026. No contest comment has been posted. This document follows the opportunity map rather than starting from ideas.

## Concept generation after the opportunity map

Twenty-two concepts were generated; none was allowed into the final set merely because its underlying trend is popular.

| Concept | Opportunity served | Decision and reason |
| --- | --- | --- |
| **Wallet Work Account** | Foreign earnings, exact receipt, income evidence, payout split, local exit | **Finalist.** One recurring job with large strategic value. |
| **Wallet Permissions** | App/automation mandates, subscriptions, agent budgets, family allowances | **Finalist.** New control primitive, not an AI feature. |
| **Return Desk** | Returned exchange withdrawal attribution | **Finalist.** Best precise, documented small-interface gap. |
| **Risk Lock** | Enforce self-chosen perpetual session limits | **Finalist.** Responsible and implementable trading differentiation. |
| **Wallet Replay** | Learn from a closed position | **Finalist.** Concrete repeat trigger and clear MVP. |
| Receive Exactly | Recipient specifies amount/currency; Wallet finds a route | Kill. A loaded contest entry already proposes this exact core, including routing, fees, invoices and recurring payments. Work Account may quote net proceeds, but cannot claim that as its novelty. |
| Income Passport | Verified bundle of invoices and receipts | Fold into Work Account. Alone it is infrequent and close to generic exports. |
| Smart Split | Allocate incoming funds to tax/bills/save | Fold into Work Account. Generic automation alone is not original. |
| Local Exit Radar | Live comparison of eligible off-ramps | Kill. Could become a referral marketplace with inconsistent quotes and support ownership. |
| Verified Handshake | Both parties confirm identity before first transfer | Reserve. Useful, but scam-warning/recipient-verification territory is saturated. |
| Onchain Subscriptions | Familiar recurring mandates and cancellation | Fold into Permissions. |
| Agent Pocket | Separate funded account for an AI agent | Fold into Permissions; “AI wallet” alone would be hype-led. |
| Family Pocket | Controlled allowance for family | Fold into Permissions; narrower and region-dependent. |
| Beginner Journey | Staged path from Gram to Wallet/DeFi | Reserve as lifecycle UX, but product evidence is internal-only. |
| Goal Dollars | Familiar stablecoin saving goals | Kill. Aave App, MiniPay Pockets and neobanks already validate and crowd it. |
| Private Receive | Fresh independently keyed receiving accounts | Reserve. Strong privacy idea, but recovery/linkability complexity limits first release. |
| Private Proof | Purpose-bound proof of balance/eligibility | Reserve. Technically novel but low-frequency and difficult to explain. |
| Refund Object | Original charge and refund share one status object | Reserve as merchant infrastructure; evidence weaker than Return Desk. |
| Merchant Passport | Cross-merchant identity/loyalty | Kill. Two-sided network and privacy burden; Blackbird validates but also exposes benefit ambiguity. |
| Creator Instant Wallet | Platform payouts arrive below thresholds | Fold into Work Account. |
| Pulse / event markets | Follow and trade real-world outcomes | Kill. Multiple wallets shipped it in 2026; heavy regulatory exposure. |
| Portfolio Stress Test | Show scenario-level exposure across assets | Reserve. Useful but adjacent to analytics/AI comments and dependent on model assumptions. |

## Aggressive elimination gate

A finalist had to pass all six gates: a named user with a recurring or severe problem; evidence beyond launch marketing; no exact inspected-comment match; a credible first release; a Wallet-specific advantage; and a reason to exist now. This killed generic cards, QR, remittance, AI copilots, rebalancing, copy trading, yield, prediction markets and bundles with no single job.

## Finalist 1 — Wallet Work Account

**Promise:** Get paid from anywhere. Keep proof. Choose what lands.

- **Problem:** Global workers stitch together invoices, foreign account details, PayPal/Wise, exchanges, stablecoin wallets, spreadsheets and local cash-out. Fees, holds, source-of-funds evidence and last-mile conversion remain failure points.
- **User:** Freelancers, remote employees, creators, contractors and small digital businesses paid across borders.
- **Evidence:** Airtm, Belo, Grey, Cleva, ARQ, Phantom Cash, Deel and Visa all ship or pilot parts of the journey (`FACT`). Independent Reddit posts repeatedly describe holds, FX leakage, client friction, last-mile conversion and proof-of-income problems (`ANECDOTE`).
- **Current behavior:** Give each payer a bank account, platform payout method or wallet address; manually match receipts; later find a local route and assemble documentation.
- **Product:** A reusable **Work Link**. The worker creates an invoice or recurring payer profile and chooses allowed collection methods. The payer sees eligible familiar methods—bank transfer, card or crypto—and the full charge before paying. Wallet receives into a work balance, attaches payer/invoice evidence, applies optional percentage splits, and shows eligible hold/spend/local-withdraw routes. A downloadable Income Record contains invoices, payer references, Wallet ledger entries and onchain hashes without pretending to be a tax filing or bank statement.
- **UX:** `Wallet → Get paid → Work Account → New work link`. Payer does not need Telegram or crypto. States: Draft, Sent, Payer started, Funds pending, Compliance action, Paid, Available, Withdrawn. Every hold identifies the owner and next action.
- **Why Wallet:** Existing identity, stablecoin balances, contact/payment distribution, transaction ledger and Telegram conversations reduce setup and acquisition friction. It turns Wallet into the destination of earnings rather than a place funded after earnings arrive.
- **Differentiator:** Not “crypto payroll,” universal asset routing or another card. It connects a recurring payer relationship, work evidence, payment state, allocation and local exit as one object. Exact-receipt routing is explicitly not claimed as original because a loaded contest comment already proposes it.
- **Existing products:** Airtm is the closest consumer prior art for payment links and local methods; Belo/Grey/Cleva serve workers; Phantom Cash offers direct deposit; Deel/Visa support stablecoin payouts. No evidence found that one product universally solves every corridor or combines the whole proposed lifecycle. That is whitespace, not proof of exclusivity.
- **Trend signal:** Stablecoin rails are moving into payroll, creator payouts and virtual accounts while consumers increasingly see a money account rather than a chain.
- **Reach/frequency:** Potentially broad and monthly/weekly. Exact Wallet-addressable demand requires internal research.
- **Retention/revenue:** Repeated payer links, conversion/withdrawal and work-balance use create primary-account behavior; revenue can come from transparent collection, FX or payout fees and partner economics, never a hidden spread.
- **Feasibility:** MVP in 1–2 corridors with one collection method, USDT receipt, invoice context, exact quote and exportable record. Local withdrawal can initially route through existing P2P/partners. Do not promise global launch.
- **Regulation/security:** KYC/AML, sanctions, money-transmission, card/wire returns, tax-document wording, payer fraud and corridor licensing are core product requirements. Funds and finality states must remain explicit.
- **Defensibility:** Payer graph, repeat workflows, compliance history, corridor reliability and distribution—not the stablecoin rail itself.
- **Weakness:** Highest execution and regulatory burden; many well-funded adjacent competitors. The full vision is not a quick UI feature.

## Finalist 2 — Wallet Permissions

**Promise:** Approve the rules once—not every action, and never unlimited access.

- **Problem/user/evidence:** People using recurring services, trading automations and emerging agents need a safe middle ground between confirming every action and surrendering broad access. Coinbase ships token/time/amount permissions; Crossmint and Skyfire document scoped agent controls (`FACT`). Consumer demand at Wallet scale is still an `ASSUMPTION`.
- **Current behavior:** Manual confirmations, standing custodial instructions, or broad token approvals with fragmented revoke interfaces.
- **Product:** A permission card with verified app identity, allowed action, asset, recipient/contract allowlist, per-action maximum, rolling cap, expiry and notification policy. Anything outside rules returns for confirmation. One **Permissions** screen shows remaining allowance, usage, pause and revoke. V1 supports only eligible low-risk actions; no withdrawals, leverage, seed access or re-delegation.
- **UX:** An app requests terms; Wallet translates them into plain language; the user can only reduce limits before approving. Receipts identify which permission authorized each action.
- **Why Wallet/differentiator:** Wallet can make permissions legible across its custodial actions and eligible self-custodial automations, inside the product where users already manage money. The distinct object is the universal, auditable mandate—not an AI bot or payment button.
- **Prior art/trend:** Coinbase, Crossmint, Skyfire and account abstraction prove technical timing. The contest originality is the consumer control center and consistent human contract, not the underlying idea of delegation.
- **Reach/frequency/retention/revenue:** Starts with smaller advanced cohorts but can support subscriptions, commerce, family allowances and agents. It enables partner/API revenue and safer repeat transactions.
- **Feasibility/regulation/security:** Custodial enforcement can be server-side; self-custodial enforcement requires suitable smart accounts/contracts. Atomic cap accounting, revocation latency, app identity changes and every alternate execution path need adversarial testing.
- **Defensibility/weakness:** Trust, app-verification distribution and policy history can compound. Initial user demand and cross-account consistency are uncertain; pitching “agents” too heavily would age badly.

## Finalist 3 — Return Desk

**Promise:** Bring returned funds back into view.

- **Problem/user/evidence:** A rejected exchange deposit may be returned to Wallet's central address and require a manual claim. Wallet's own guide documents the evidence and verification process (`FACT`).
- **Product/UX:** On the original withdrawal, **Exchange returned this** prefills Wallet-known data. The user adds the return hash and exchange confirmation; one case shows evidence needed, return located, ownership/compliance review and credit, always naming the next actor. Original and return transactions remain separate.
- **Why Wallet/differentiator/prior art:** Only Wallet can link its outbound ledger, central receiving address and account review. Coinbase recovery is precedent for a structured recovery interface but handles different cases.
- **Reach/frequency/retention/revenue:** Low reach and frequency, extreme moment-of-truth value. It reduces support repetition rather than directly monetizing.
- **Feasibility/regulation/security:** One network and one return pattern first. Hash/amount similarity cannot establish ownership; batched, partial or conflicting claims need review and anti-fraud controls.
- **Defensibility/weakness:** Deep internal integration is defensible. Unknown case volume may make it operationally valuable but strategically small.

## Finalist 4 — Risk Lock

**Promise:** Set your limits while calm. Keep them when it matters.

- **Problem/user/evidence:** A stop-loss manages a position, not the next revenge trade. TopstepX documents locked controls (`FACT`); user reports support the behavior (`ANECDOTE`), not efficacy.
- **Product/UX:** User sets maximum opening leverage, session-loss trigger and expiry. Tightening is immediate; loosening waits. Trigger cancels opening orders and blocks new/increasing exposure while allowing reduce/close/withdraw. The latch does not reset on deposits or temporary P&L recovery.
- **Why Wallet/differentiator/prior art:** It extends Wallet's perpetuals and stakes a responsible-product position. Professional trading products are prior art; mainstream crypto-wallet implementation is less common.
- **Reach/frequency/retention/revenue:** Limited to perpetual traders but relevant every session. Success is compliance with self-chosen limits, not additional trading volume.
- **Feasibility/regulation/security:** Requires server-side enforcement across every entry path and race-condition tests. It cannot guarantee a maximum loss on open positions; wording must be exact.
- **Defensibility/weakness:** Trust and risk reputation, not technical moat. It can reduce short-term volume and serves a minority.

## Finalist 5 — Wallet Replay

**Promise:** Make your last trade your next lesson.

- **Problem/user/evidence:** Closed-position P&L does not show how entries, resizing, margin, fees and funding combined. TradingView proves replay as a learning pattern (`FACT`).
- **Product/UX:** `Closed position → Review this trade` replays actual events on the recorded price timeline. A separate Simulation branch permits one alternative. Actual and modeled results can never be confused. The user saves one lesson that may appear before a later trade.
- **Why Wallet/differentiator/prior art:** Wallet owns the fills and funding/margin rules needed to explain the exact trade. Generic chart replay lacks that account-specific reconstruction.
- **Reach/frequency/retention/revenue:** Trader-only, but every close creates a return trigger. It may improve long-term trading trust and education; it should not be gamified to increase volume.
- **Feasibility/regulation/security:** Begin with one market and only branches supported by historical event data. Intracandle ordering uncertainty must be shown or disabled.
- **Defensibility/weakness:** Proprietary personal event history improves relevance. Educational benefit and repeated use remain unproven.

## Competition score: four criteria, 25 points each

| Finalist | Depth /25 | Value /25 | Originality /25 | Wallet fit /25 | Total /100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Wallet Work Account | 24 | 24 | 20 | 24 | **92** |
| Wallet Permissions | 23 | 22 | 23 | 25 | **93** |
| Return Desk | 25 | 18 | 23 | 25 | **91** |
| Risk Lock | 24 | 19 | 22 | 24 | **89** |
| Wallet Replay | 23 | 18 | 21 | 24 | **86** |

Permissions narrowly leads the literal judging rubric. Work Account is selected below because its recurring primary-account behavior, reach and strategic upside survive the broader product tests better; the one-point rubric difference is not measurement precision.

## Product score: ten dimensions, 10 points each

| Finalist | Pain | Reach | Frequency | Evidence | Fit | Timing | Business | Feasibility | Novelty | Low competition | Total /100 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Wallet Work Account | 9 | 8 | 9 | 9 | 9 | 10 | 9 | 6 | 7 | 5 | **81** |
| Wallet Permissions | 9 | 8 | 8 | 9 | 10 | 10 | 9 | 7 | 8 | 7 | **85** |
| Return Desk | 10 | 3 | 2 | 10 | 10 | 8 | 6 | 8 | 9 | 9 | **75** |
| Risk Lock | 9 | 4 | 8 | 7 | 10 | 9 | 7 | 8 | 8 | 8 | **78** |
| Wallet Replay | 7 | 4 | 7 | 8 | 10 | 8 | 7 | 7 | 8 | 8 | **74** |

## Five judging models

| Lens | Ranking | Reason |
| --- | --- | --- |
| End user | Work Account → Return Desk → Permissions → Risk Lock → Replay | Income and stuck money are concrete; permissions becomes valuable once automation exists. |
| Senior PM | Permissions → Work Account → Return Desk → Risk Lock → Replay | Permissions is a reusable platform primitive; Work Account is a larger multi-quarter bet. |
| Growth leader | Work Account → Permissions → Replay → Risk Lock → Return Desk | Payer links create acquisition loops; permissions enables partner retention. |
| Founder / investor | Work Account → Permissions → Risk Lock → Return Desk → Replay | Work Account can change Wallet's category and deposit behavior; Permissions can become infrastructure. |
| WalletIdeas judge | Permissions → Work Account → Return Desk → Risk Lock → Replay | Permissions maximizes visible fit/originality; Work Account wins value and ambition but resembles adjacent fintechs. |

## Obviousness, startup, anti-hype and 50M-user tests

| Finalist | Obviousness test | Startup test | Anti-hype test | 50M-user test |
| --- | --- | --- | --- | --- |
| Work Account | Many offer fragments, but the job remains fragmented. Pass. | Multiple funded startups validate urgency; competition is real. Pass with caution. | Works without mentioning blockchain or AI. Strong pass. | Not all users work globally, but tens of millions plausibly receive digital income; needs corridor rollout. Pass. |
| Permissions | Underlying capability exists in developer stacks; consumer synthesis is not yet obvious. Pass. | Infrastructure startups are building it; consumer pull is earlier. Conditional pass. | Still valuable for subscriptions/automations without AI. Strong pass. | Could become universal as apps act on money; today reach is smaller. Conditional pass. |
| Return Desk | Obvious once the support process is seen, yet still unsolved in UI. Pass. | Too narrow for a standalone startup. Fail—but suitable for a product contest. | No hype dependence. Strong pass. | Most never need it; the affected minority values it intensely. Fails reach, passes trust. |
| Risk Lock | Known in professional trading; less common in consumer crypto. Pass. | Standalone business is weak. Fail. | Behavioral need predates current hype. Pass. | Only active leveraged traders. Fail reach. |
| Replay | Known pattern applied to personal records. Borderline. | Standalone product could be educational but distribution is hard. Conditional. | No hype dependence. Pass. | Trader subset only. Fail reach. |

## Missed-direction scan: five challengers only

1. **Verified Recipient Handshake:** both parties confirm identity and route before first transfer. It could replace Replay if future comment duplication appears, but scam/security ideas are crowded.
2. **Private Receive:** strong creator/freelancer privacy narrative. It could replace Replay after a TON recovery prototype proves safe discovery and unlinkability bounds.
3. **Beginner Journey:** staged migration from Gram to self-custody/earn/trade. It could be a major activation project, but only Wallet funnel data can prove the problem.
4. **Refund Object:** merchant refund linked to original payment and settlement route. Promising infrastructure, but evidence is currently weaker than Return Desk.
5. **Portfolio Stress Test:** show portfolio outcomes under FX, correlation and liquidation scenarios. Useful, but comment saturation and modeling assumptions weaken originality.

None currently displaces the five.

## Final live-comment collision check

The authenticated Telegram Web discussion still displayed 408 comments. The currently loaded accessibility content included a direct `WALLET SMART PAY` submission where the recipient receives exactly the requested asset, Wallet chooses the route, and payment links/invoices/recurring payments are extensions. It also included generic local cash-in/out, international remittance, freelancer escrow/ProofPay, creator revenue management, tax exports, Smart Vault splits and app spending limits.

No loaded entry described the complete Work Account object: foreign-client payer profile plus linked work evidence, payment/compliance state, work balance allocation and verified exit. That is a bounded absence statement about loaded content, not a guarantee over deleted, unloaded or future comments. It means the final pitch must lead with the work-income lifecycle and must not use “exact receive” as its originality claim.

## Final winner: Wallet Work Account

I would recommend **Wallet Work Account** professionally as the one strategic winner. Wallet Permissions is the cleaner contest-feature score leader, but Work Account answers a larger question: why should a person make Wallet the place their money arrives first? It converts global work into recurring funded balances, repeated payer acquisition, exchange/spend/earn use and defensible compliance/corridor knowledge. That is more game-changing than adding another destination for money already inside Wallet.

### Fifteen-question final audit

1. **What exact user is it for?** A freelancer, remote worker, creator, contractor or small online business receiving foreign earnings.
2. **What exact job is failing?** Getting from “client owes me” to “usable, documented money in my preferred form.”
3. **Is the pain real?** Yes: primary products target it and independent anecdotes repeatedly cite holds, FX, payer friction, cash-out and documentation. Prevalence for Wallet users is not measured.
4. **Why does current Wallet not solve it?** It can receive crypto and support transfers, but it does not give a non-crypto payer a work-specific payment flow with invoice context, recipient-outcome quote and income record.
5. **Why not use Wise, PayPal, Airtm or Deel?** Many users will. The opportunity is a Wallet-native choice for corridors/users those products price poorly, restrict or fail, and for workers who want earnings to remain immediately useful as stable digital money.
6. **Is it merely a bundle?** No. The stable object is a Work Link/payment record spanning request, collection, evidence, balance allocation and exit. Remove that object and it collapses into a feature list.
7. **What is the smallest credible MVP?** One launch corridor; verified worker; invoice/work link; one payer bank method plus crypto; exact fee/net quote; USDT balance; linked receipt export; one existing eligible exit route.
8. **Why now?** Virtual accounts, stablecoin settlement and payout APIs are shipped; Visa/Deel/Stripe-era pilots show regulated businesses moving from experimentation to payout products.
9. **Why Wallet?** Global distribution, familiar chat sharing, verified accounts, stablecoin balances and existing money actions reduce both payer acquisition and post-payment fragmentation.
10. **How often is it used?** Per invoice or pay cycle—weekly or monthly for the target segment.
11. **How does it grow?** Each Work Link reaches an external payer; successful recurring payers and worker referrals create a two-sided acquisition loop without requiring public financial social graphs.
12. **How does it make money?** Transparent collection/FX/payout fees, partner revenue and higher retained balances; never by obscuring the spread.
13. **What can kill it?** Insufficient corridor coverage, poor local exits, payer fraud/returns, compliance holds, surprise fees or positioning it as universal before it is.
14. **What must Wallet measure first?** Existing inbound stablecoin salary patterns, support cases about international earnings, top payer countries, cash-out destinations, quote abandonment, repeat payers and evidence-export demand.
15. **Would I stake a professional recommendation on it?** **Yes**, provided the proposal explicitly starts narrow and treats compliance/local exit as product—not back-office details. It is not guaranteed to be Wallet's roadmap priority, but among the researched opportunities it has the strongest combination of real recurring pain, timing, growth loop and category-changing upside.

## Contest-ready core, not yet posted

**Wallet Work Account — get paid from anywhere, keep proof, choose what lands.**

Freelancers and creators often need five tools just to receive one international payment: an invoice, foreign account, payment processor, crypto exchange and local cash-out route. Payment status and holds are unclear, and a wallet transaction alone may not prove legitimate income later.

Add a reusable Work Link. The worker attaches an invoice or work description; the payer uses an eligible familiar method—bank, card or crypto—and both sides see one payment status. Wallet links payer evidence and the invoice to the receipt, optionally splits a percentage for bills/savings, and shows only verified local withdrawal choices. An exportable Income Record combines invoices, payer references and transaction hashes without pretending to be a tax return or bank statement.

Start with one corridor, one bank collection partner and USDT. The bigger direction is to make Wallet the place global earnings arrive first—not another wallet users fund afterward. **#WalletIdeas**

## Sources most relevant to the winner and finalists

- [Airtm payment link and local methods](https://www.airtm.com/en/receive-and-withdraw/receive-payments-from-clients-and-companies/)
- [Airtm US virtual account](https://help.airtm.com/en/support/solutions/articles/47001259147)
- [Belo Upwork withdrawal to USDC](https://help.belo.app/en/articles/9518380-how-to-withdraw-your-balance-from-upwork-to-belo)
- [Grey remote-worker account](https://www.ycombinator.com/companies/grey)
- [Cleva stablecoin-backed worker account](https://www.ycombinator.com/companies/cleva)
- [Phantom Cash](https://phantom.com/learn/blog/introducing-phantom-cash)
- [Visa Direct stablecoin payouts](https://corporate.visa.com/en/sites/visa-perspectives/newsroom/visa-direct-stablecoin-payouts.html)
- [Deel stablecoin salary payout](https://help.letsdeel.com/hc/en-gb/articles/42834641567121-Getting-Paid-in-Stablecoins)
- [Coinbase spend permissions](https://docs.cdp.coinbase.com/wallets/using-wallets/spend-permissions)
- [Crossmint scoped agent payments](https://docs.crossmint.com/agents/how-agents-pay)
- [Wallet return guide](https://help.wallet.tg/article/250-sending-ton-to-exchanges)
- [TradingView Replay](https://www.tradingview.com/support/solutions/43000691889-learn-to-trade-on-historical-data/)
- [TopstepX controls](https://help.topstep.com/en/articles/14434175-topstepx)
