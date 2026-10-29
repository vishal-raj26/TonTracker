# Fomo Android product observations

Date: 2026-10-02. Source: actual running Android app on the connected device, viewed through scrcpy `AC2001`. Computer Use provides screenshots and navigation; ADB supports device geometry, held chart touch and Android back. Device reports 1080 × 2400. Mirror screenshots observed at approximately 355 × 786 content pixels. Measurements below are approximate mirror proportions, not extracted proprietary tokens.

Status: **observation session stopped at the user's request: “I think that's enough.”** Enough recurring patterns were observed to prepare the design model; this is not an exhaustive claim. Current TonTrack nested-route audit and live pricing verification still have gaps. No Fomo transaction, trade, withdrawal, invitation, follow, like, account edit or security/notification preference change was submitted. Do not store account emails, wallet addresses, QR payloads or private history amounts in this document.

## Evidence vocabulary

- Interacted: opened or changed a safe view/control and observed its result.
- Observed: visible in the running app, but not activated.
- Inferred: a proposed recurring rule from several observations; not an exact implementation fact.
- Unverified: unavailable, unresponsive or deliberately excluded; do not invent behavior.

## Navigation map and coverage

| Area | Directly interacted paths | Remaining gaps |
| --- | --- | --- |
| Home / markets | Tokens, network filter sheet, temporary single-chain checkbox selection, dismissal | Watchlist, Crypto / Most held / remaining horizontally hidden market categories, Perps, weekly trade cards |
| Spot token detail | Newly launched WWW and established verified BTC; 1H/4H/7D ranges; line/candle switch; marker settings; Holders/About/Feed; deep statistics; scroll-to-top; feed min-size and custom numeric input; asset closed-trades view and recent/top sorting; Android share chooser (no destination selected) | Remaining ranges, friend-holder filter, verification/fee explanation, watch toggle deliberately not changed |
| Chart interaction | BTC held touch via ADB: main value changes, vertical selection line, time tooltip, axes appear, later line segment dims, timeframe choices collapse to selected period; release restores live value and full controls | Profile scrub attempt did not establish a selected point; do not assume it works identically |
| Holder position | Token holder → position sheet → expanded sheet; public profile link; historical closed position; transaction accordion; thesis timeline | Share action on a position was not reliably established; some input landed on thesis content during changing layout |
| Public profile | Profile loading → loaded portfolio; 24h→7d; open→closed positions; top→recent order; closed-position search with query; matching position detail; followers/following/mutuals lists; mutuals empty state; another public profile reached from list | Profile history control produced no verified response; profile share not submitted; follow actions untouched |
| Global discovery | Recents; focused search and keyboard; typed public query `bitcoin`; grouped token/perps/clan results; BTC spot detail | Dedicated Tokens/Perps/Traders/Clans search tabs; no-result search; perps detail |
| Main feed | Global loaded feed; pinned recap inline expansion; token-specific thesis feed and filter sheet | Friends tab and top filter did not produce a verified visible response after mirror and ADB attempts; scroll/read more deep feed pending |
| Community | Leaderboard loading→populated; Clans View all; clan list; Dabal detail; members/holdings/feed/thesis; shared min-size filter; clan creation form; invite-member search entry without selecting anyone | Leaderboard scope dropdown and ranges; Friends tab response unverified; clan more menu response unverified; creation image editors excluded; no clan/invitation submitted |
| Own account | Account portfolio, cash row, open/closed controls visible, rewards entry | Own chart ranges/scrub; cash contextual menu; hidden positions; closed positions; own history entry; profile media editors |
| Rewards | Rewards page; creator-reward explanation; referral sheet | History-row behavior and share preview not checked; no referral shared |
| Settings | Root; Edit profile; address accordion and full scroll; Appearance and Haptics; Language; Notifications; notification asset type; Price alerts; Friends activity thresholds/search; Legal and Privacy menu | Taxes, Help, bottom settings remainder unvisited when user stopped |
| Security | Security page labels observed | Touch ID and MFA untouched; authentication/security setup excluded |
| Funding navigation | Cash summary sheet; method selection; crypto network selector; Solana receive instruction/QR layout; transfer-history entry | Debit/exchange provider branches, transfer and withdrawal flows excluded; no deposit initiated. Selecting receive network displayed an automatic copied-address toast; do not transfer this behavior to TonTrack without justification |
| Account history | Cash / Trades / Transfers / All; loading; chronological rows; failed historical deposit explanation; a historical trade row opens token detail | Successful transfer-row behavior and deeper pagination pending; no retry/contact support triggered |

## Recurring visual system — inferred from directly observed screens

- Almost-black background with a subtle violet cast. Raised controls/sheets/inputs use a slightly lighter violet-black. Text is soft white; metadata and inactive controls use multiple gray levels. Blue-violet is the normal selection/action accent. Green and orange/red express financial direction or trade type.
- Financial totals, charts, asset/holder lists and statistics are usually **unboxed**. Containers are reserved for summary bundles, promotional/social content, mini position results, rank summaries, inputs and sheet choices. The reading order is value → change/context → chart → secondary controls → rows.
- A geometric/rounded sans family appears throughout. Exact font is unknown. Main portfolio totals are visibly larger than section headings; list names use modest semibold; metadata is smaller and lighter; values align on the right. Headlines are not applied to every number.
- Default page gutters visually about 15 mirror pixels; sheets often use 23. Common asset rows have approximately 44-pixel avatars and roughly 60-pixel rhythm, with larger social rows expanding for explanatory text. Ordinary action buttons about 44 pixels high; compact follow buttons about 30. These are visual estimates, not canonical dp values.
- Buttons and input surfaces use moderate rounding. Bottom sheets have much larger top corners and a short centered handle. Nested sheets often expand upward to fit content. Footer actions stay reachable above the phone bottom edge.
- Secondary tabs use simple text and a thin underline, not large cards. Small pill filters use quiet borders, modest rounding and a compact selected surface. Checkbox selection is blue; settings switches use blue on-state and a dark off-state.
- Repeated rows share left icon/image, text stack, and right value/action. Numbers have consistent alignment. Sparse states leave open space rather than filling the page with explanatory cards.
- The main five-item dock is a rounded raised bar with distinct selected-item background. Deep details hide it and use a back header. Financial/trading detail has its own pinned bottom action area. This action content is Fomo-specific; TonTrack should translate it to relevant portfolio actions rather than copy trading.

## Chart observations

Spot details use a large, nearly edge-to-edge chart directly below the main value. The chart reserves its height while loading or switching periods. The initial token view showed number skeletons and an empty reserved chart; timeframe change briefly quieted existing content before the next graph appeared. These observations establish stable geometry, not a precise animation duration.

Top left displays unit price; top right displays market cap, with a small change indicator/label. The graph itself uses market cap at its endpoint tag. The endpoint pulses in the live view. Typical range controls sit below the graph; available ranges differ with token history. Newly launched token showed LIVE/1H/4H/ALL; mature BTC showed 1H/1D/7D/1M/3M/6M/ALL. Line and candle presentation are interchangeable, followed by a marker-settings button.

Held chart touch was captured while the ADB gesture remained down, not inferred from a post-release screenshot. A vertical hairline and time label appear; relevant past segment stays stronger, the later segment becomes quieter, main value/change respond to selection, axes become visible, and full timeframe controls temporarily give way to the selected range. On release, normal controls and live value return without a layout shift.

Profile portfolio charts occupy less height and place timeframe controls beside the main total. Public profiles have 24h/7d/30d; the own profile also offers All. Profile scrubbing remains unverified. Do not blindly use the market-cap token chart semantics for TonTrack portfolio value.

## Nested detail and scrolling

- Token About has description, Website/Twitter shortcuts, transactions with paired buy/sell counts/volume/participants, holder statistics, and compact label/value stats (market cap, volume, liquidity, supply, creation, launchpad, chain, contract). Thin dotted leaders connect muted labels to right values. Description and financial statistics are not independent oversized cards.
- Scrolling token detail compacts the header to token identity plus live market cap/change. The bottom action remains fixed; a return-to-top control appeared near lower content. Tab switch in the scrolled position retained a compact header; full chart was not immediately reintroduced.
- Holder position uses a sheet with user/Follow header, token identity, chart/markers, one position summary card, thesis, and a transaction accordion. Public profile is reached from its header. Historical closed position uses profit plus average entry/exit and historical transactions.
- Thesis timeline is a nested view with centered title, small token/profit summary, threaded vertical structure, timestamped statements and quiet reactions. No reactions or shares were submitted.
- Public profile uses cover image, avatar, name/handle, follow metadata, small trading metadata, prominent value/change, chart, cash, and positions. Open/Closed selector aligns with Positions header; All/Tokens/Perps filters follow. Closed list offers immediate top/recent sorting and contextual search.
- Contextual closed-position search is a full view with top search/cancel and keyboard. Main discovery search instead starts as a floating bottom field above the dock and moves above the keyboard. Search results group asset classes. Leaving token detail returned to recents; the prior global query was not preserved in the observed path.

## Loading, empty, error and disabled states

- Loading uses reserved geometry: skeleton blocks for profile data and financial values, simple spinner for some chart/rewards areas, and quiet placeholder avatars/content. Some list pages briefly show their empty state before populated content arrives; do not copy this transient flicker into TonTrack.
- Mutuals showed a plain `No friends following` message below tabs. Asset closed-trades view showed `No closed trades` with sorting still present. Own open positions showed quiet `No open positions`. Leaderboard initially showed logo plus `No leaderboard`, then real rows appeared.
- Historical failed-deposit row kept an explicit orange failure label. Opening it showed a sheet with warning icon, short title, explanation, Contact support and Close. No retry/third-party contact occurred.
- Edit profile Save remained disabled with no edits. Create-clan button remained disabled and explained the missing invited-member requirement. Neither form was submitted.
- Chart settings repeated two contained checkbox rows for Buys/Sells and Close. Min-size filter reused the same All/>$1K/>$5K/>$10K/Custom controls in token and clan feeds; Custom opened a numeric keyboard and shifted the sheet above it.

## Interaction caveats and limits

- Single screenshots establish appearance, not measured frame timing or spring physics. Sheets visibly expanded and collapsed; exact motion curves are unknown.
- Some top controls did not visibly respond after attempts. This is logged rather than described as a working feature.
- Tapping outside the receive sheet once navigated the underlying Settings page to Edit profile while the sheet remained visible. Android Back dismissed the overlay. Treat this as a caution about overlay interception; do not assume outside-tap dismissal is consistent.
- ADB UI hierarchy dump could not obtain an idle state while content updated; scrcpy exposes only the Windows container accessibility. Visual observation remains primary.
- No proprietary binary, code or bundled media was inspected or extracted. No internet reference has been used for these observations.
- Legal and Privacy exposes Terms, Privacy Policy, Token Verification Disclaimer and Delete account. Delete was untouched. Disclaimer opened an official `fomo.family` custom-browser destination; this is external legal content, not a primary native design reference. No acceptance form was submitted. The user stopped exploration after this point; issue no further device input without renewed direction.

## Initial TonTrack translation hypotheses (not implementation decisions)

1. Give portfolio value and its change the strongest hierarchy; let holdings and activity become quiet, consistent rows.
2. Build one detail scaffold around real asset identity, available value/evidence, stable chart geometry, and appropriate secondary tabs. Gift/identity data still need their own domain-specific semantics.
3. Use short sheets for filters and explanations; reserve full screens for sustained search, settings and complex asset information.
4. Preserve stable content during refresh, reject transient false-empty states, and keep unavailable financial data explicit.
5. Reuse value, row, input, tab, sheet, loading and state rules across every nested asset route. Validate these hypotheses against the unfinished populated TonTrack audit before committing structure.
