# Existing Telegram Wallet and Payment Features

## Scope and conclusion

Evidence checked on 10 September 2026. This inventory prioritises the contest host, direct Telegram wallet competitors, and adjacent products capable of solving the same user problems. It is a documented-availability audit, not an exhaustive census of Telegram bots or an independent security review.

Chat payments, gift cards, claimable transfers, multi-user collection, donation goals, recurring support, shared-expense tracking, escrow, portfolio analysis and automated trading all have existing implementations or advertised products. These categories cannot responsibly be presented as new simply by adding Wallet branding or a more attractive chat card.

No contest concept is selected. The earlier Deal Rooms and Wallet Plans recommendations are withdrawn. Their narrower mechanisms may still differ from individual competitors, but that is not sufficient evidence of meaningful originality or demand.

## Evidence classifications

**Documented available:** A provider describes a current feature and supplies usage instructions or operational API documentation. This is stronger than a promotional headline but does not establish that the feature works for every account, country or app version.

**Provider launch claim:** A provider says a service has launched or is on mainnet; its end-to-end operation and adoption have not been independently checked.

**Beta or rollout:** The cited provider explicitly labels availability as limited. An older beta announcement is not automatically evidence that a feature remains in beta today.

**Prototype:** A repository or demonstration establishes prior work but not a maintained consumer service.

**Unknown:** The exact mechanism is not established by available evidence. Unknown is not absent. No entry in this audit is labelled personally transaction-tested.

## Direct product baseline

| Product | Existing capability supported by evidence | Status and boundary |
|---|---|---|
| Crypto Wallet | Contact transfers, exchange, P2P, Earn, investment-return views and tokenized assets | Documented available. Custodial; verification and regional limits apply. External wallet import is not supported.[^1] |
| Crypto Wallet trading | Spot exchange and perpetual positions with take-profit/stop-loss mechanics | Documented available. Supported assets and non-withdrawable trading assets differ; do not propose generic charts, perps or trading controls as a new category.[^2] |
| DeFi Account | TON jettons/NFTs, swaps, dapp connections and contact transfers | Documented available, with a separate provider and self-custodial model. Its capabilities are not automatically Crypto Wallet capabilities.[^1] |
| My Wallet, formerly MyTonWallet | Multichain self-custody, portfolio/P&L, swaps, multisend, multiple accounts/subwallets, collectibles and AI agent | Advertised current product features on its official site. Specific platform parity and agent permissions require further testing.[^3] |
| My Wallet / @push | Telegram crypto-transfer product linked from @myapp | Public bot entry point establishes the product identity and Telegram presence. Detailed gifting, cancellation and claim behaviour need trusted-source and in-app confirmation before assigning precise parity.[^4] |
| Crypto Bot / @send | Inline checks, single/multiple activations, recipient restriction, password, image, gift-card presentation and eligibility restrictions | Documented available. “Send money as a beautiful Telegram gift” already has direct precedent.[^5] |
| Crypto Pay | Invoice creation, checks, transfers, status queries and webhooks | Operational API documentation. A generic developer payment API or automated payout proposal is not new.[^6] |
| xRocket | Wallet, swaps, trading, P2P, personal/multi cheques and invoices | User guide documents these features; the older overview has unclear mini-app parity wording. Verify the relevant bot or mini-app surface rather than assuming equivalence.[^7] |
| xRocket invoices | Single and multi-payment requests, configurable payment limits, descriptions and shared links | Documented available. This directly overlaps group collection; it does not by itself establish conditional all-or-nothing funding.[^8] |
| xRocket cheque API | Reserved funds, recipient identifiers, cancellation returning reservations, completion/error states | Operational documentation explicitly describes these mechanisms. Reserving and returning funds is not itself novel.[^9] |

## Adjacent Telegram-native competition

| Product or platform | Existing capability | Classification and consequence |
|---|---|---|
| Tribute | Donations, paid access, digital/physical product monetisation | Documented available through its site. Creator monetisation is an established category, not an untouched Wallet opportunity.[^10] |
| Tribute recurring donations | Supporter-selected amount and recurring frequency | Usage documentation. Do not confuse a recurring donation with a membership subscription.[^11] |
| Tribute Goals | A creator sets a specific donation target and shares it with subscribers | Documented available. A target and progress narrative alone do not differentiate Wallet Plans.[^12] |
| Tallycents | Shared expenses, Telegram group bot/mini app and outstanding-balance reminders | Public product instructions and terms. Establishes expense tracking, not verified crypto settlement or custody.[^13] |
| Telegram gift offers | Price and deadline, reserved payment, refund on rejection/expiry and transfer on acceptance | Official platform release. Generic protected collectible offers already exist.[^14] |
| Telegram suggested posts | Negotiated channel content and conditional compensation | Official platform release. A narrower form of paid deliverable workflow already exists.[^15] |
| EXMON Escrow | Create/manage escrow deals in Telegram and track progress | Provider launch claim dated 17 August 2026. Security, dispute outcomes and usage are not independently verified.[^16] |
| PotBot | Shared-wallet group trading on Solana | Provider claims mainnet operation and points to a v2 dapp. Telegram-vs-v2 feature availability and adoption need independent verification. Enough prior art to challenge claims of inventing group trading, not enough to endorse the service.[^17] |
| Banana Gun | Telegram trading, sniping, limit orders and copy trading | Official documentation describes multiple interfaces. Individual features must be checked against the relevant bot and chain.[^18] |
| BONKbot | Trailing-stop trading workflow | Specific provider instructions establish prior implementation. Automated risk controls are not a new category.[^19] |

## TON ecosystem baseline

Tonkeeper matters even where a feature is not implemented as an inline Telegram bot. Wallet users can already obtain shared signing and easier gas payment in an adjacent TON wallet, so a claim to invent those capabilities would be misleading.

Tonkeeper's multisig guide, updated 13 June 2026, documents quorum signing and transaction requests. Pro is required to create the multisig, not for every participant to sign. The same guide says multisig does not support Battery or Gasless; a feature list must not imply every capability composes with every other one.[^20]

The current Battery guide describes prepaid charges for eligible token transfers, swaps and NFTs, including TRC20 USDT transfers. It states that Gram transfers are not covered. This newer guide should take precedence over older promotional explanations with different coverage and charge examples.[^21]

Tonkeeper also documents scam labels and official-support precautions. A generic “scam warning” idea is therefore insufficient without a specific additional detection or prevention mechanism.[^22]

## Corrections to previous originality claims

| Earlier proposition | Evidence-based correction |
|---|---|
| Money inside the conversation is the differentiator | Wallet, @push and Crypto Bot already establish Telegram payments. |
| Shared collection makes Wallet Plans new | xRocket multi invoices and Tribute goals already cover parts of the workflow. Tallycents handles shared-expense coordination. |
| Reserved funds and cancellation create a new primitive | xRocket documents reservations and returns; Telegram gift offers also use conditional payment. |
| A collective greeting or gift card supplies originality | Crypto Bot already documents postcard-style checks. A group greeting may improve presentation, not establish a new product category. |
| Escrow is an unoccupied Telegram opportunity | EXMON advertises a launched bot; Telegram implements narrower protected transactions. |
| An AI helper, analytics or trading automation would stand out | My Wallet and specialised trading products already occupy these areas. Exact capabilities still matter, but the category is existing. |

The exact combination of fixed recipient, group contributions, pre-deadline withdrawal and automatic target-based settlement remains **unknown** in this audited set. It must not be described either as confirmed My Wallet functionality or as a proven market gap. Novel combinations can be valuable, but their value must survive comparison with the alternatives people already use.

## Outstanding verification and limitations

No funded account workflow was executed. No private groups were joined, no wallet was connected, and no external transaction or contest comment was submitted. Published instructions support existence claims; they do not prove quality, uptime, safety or adoption. Provider user counts, audit badges and performance promises are not used as independently established facts.

My Wallet's official site and Telegram identity are clear, but indexed help results encountered during the preceding research used a differently spelled domain, `help.mywalleet.io`, while its official channel points to `help.mywallet.io`. That relationship is not verified here. The alternate domain is not used as authoritative evidence for detailed @push behaviour in this inventory. Confirm exact flows from the official app or a help route linked by the official site before relying on them.

Public pages cannot settle every platform-version difference. xRocket's newer API documentation is more precise than its older user overview; Tonkeeper's newer Battery guide supersedes older descriptions. Unknowns should remain visible rather than be silently filled in.

Contest comments remain unreviewed, so originality relative to submitted entries is also unknown. Small bots and unindexed mini apps may supply additional prior art. A product advertised as escrow or payments is not necessarily compliant with Telegram's rules; digital goods/services sold through bots and mini apps are subject to the Stars requirement.[^23]

## Gate before designing a new entry

A candidate should start with a specific failed user task, not a product name. For each candidate, record the nearest three alternatives, their exact supported flows, what still fails, evidence that users experience that failure, and the smallest technically and operationally credible improvement.

Only move forward when the difference changes the outcome materially. Fewer taps may be worthwhile, but should be described honestly as usability improvement. “Not found in these sources” is a research lead, not a novelty claim. Cultural language, visual identity and contest copy come after this test.

The appropriate next evidence is targeted workflow comparison and user-problem validation, not another ranked list of catchy concepts. No winner is asserted by this audit.

## Sources

All sources accessed 10 September 2026. Dates below are publication/update dates when explicitly available; undated pages are identified as such.

[^1]: Wallet, [Crypto Wallet, Where to Start](https://help.wallet.tg/article/113-wallet-where-to-start), current help page.
[^2]: Wallet, [Trading, Exchange, and Perpetuals](https://help.wallet.tg/article/634-trade-and-trading-assets-in-wallet), current help page.
[^3]: My Wallet, [Product site and FAQ](https://mywallet.io/), undated current page.
[^4]: Telegram public product profiles, [@myapp](https://t.me/myapp) and [@push](https://t.me/push), undated current profiles.
[^5]: Crypto Bot, [How do I create a check?](https://help.send.tg/en/articles/9820089-how-do-i-create-a-check), page displays 18 December 2024; current instructions reviewed.
[^6]: Crypto Bot, [Crypto Pay API](https://help.send.tg/en/articles/10279948-crypto-pay-api), current documentation.
[^7]: xRocket, [User Guide Overview](https://docs.pp.xrocket.tg/help), undated guide.
[^8]: xRocket, [Invoices](https://docs.pp.xrocket.tg/help/invoices), undated guide.
[^9]: xRocket, [Cheque event](https://docs.xrocket.exchange/api/pay/webhooks/cheque), current API documentation.
[^10]: Tribute, [Product site](https://tribute.tg/), undated current page.
[^11]: Tribute, [Regular donations](https://wiki.tribute.tg/for-content-creators/donations/regular-donations), displayed relative update about one year ago.
[^12]: Tribute, [Goals](https://wiki.tribute.tg/for-content-creators/goals), displayed relative update about one year ago.
[^13]: Tallycents, [Product instructions](https://tallycents.com/) and [Terms](https://tallycents.com/terms-of-service), current pages.
[^14]: Telegram, [Passkeys, Gift Purchase Offers and More](https://telegram.org/blog/passkeys-and-gift-offers), 12 December 2025.
[^15]: Telegram, [Checklists and Suggested Posts](https://telegram.org/blog/checklists-suggested-posts/fa?setln=en), 1 July 2025.
[^16]: EXMON, [Escrow Launches Official Telegram Bot](https://exmon.pro/blog/exmon-escrow-launches-official-telegram-bot/240), 17 August 2026.
[^17]: Y-DAO, [PotBot](https://y-dao.com/projects/potbot/), undated current project page.
[^18]: Banana Gun, [Documentation welcome](https://docs.bananagun.io/), undated current documentation.
[^19]: BONKbot, [Trailing Stop Loss](https://docs.bonkbot.io/bonkbot/advanced-trading/limit-orders/trailing-stop-loss), undated instructions.
[^20]: Tonkeeper, [Multisig](https://tonkeeper.helpscoutdocs.com/article/125-multisig-wallets-in-tonkeeper-pro), updated 13 June 2026.
[^21]: Tonkeeper, [The Battery](https://tonkeeper.helpscoutdocs.com/article/88-what-is-a-battery-and-what-is-it-used-for), updated 13 June 2026.
[^22]: Tonkeeper, [Common scams](https://tonkeeper.helpscoutdocs.com/article/123-how-to-recognize-and-avoid-scams), updated 13 June 2026.
[^23]: Telegram, [Bot Payments API for Digital Goods and Services](https://core.telegram.org/bots/payments-stars), current platform documentation.
