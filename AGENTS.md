# TonTrack Working Rules

## Active Workspace And Server

- The only active project is `C:\Users\vishu\Documents\New project\ton-portfolio-chart-platform`.
- Never edit, run, test, commit, or deploy `ton-portfolio-ui` or any other TonTrack copy unless the user explicitly changes the active project.
- Every local server start must use the active project's absolute working directory. Stop any existing listener on port `5177` before starting `node server.js` there.
- Before reporting that the server is live, request `http://127.0.0.1:5177/` and compare its JS/CSS version markers with the active project's `index.html`. A listening process or generic TonTrack title is not sufficient verification.
- If the served markers differ, treat it as the wrong project, stop that process, and relaunch from the active workspace.

## Communication

- Before editing, state exactly what will change in one or two sentences.
- If the request is ambiguous, ask one concise question before implementation.
- Keep progress updates and final responses short.
- Do not repeat explanations the user already accepted.
- When the user has granted full access, reuse that authorization and do not repeatedly ask for approval unless the platform explicitly requires it.

## Scope

- Make the smallest change that fully satisfies the current request.
- Do not redesign, refactor, research, or modify adjacent screens unless requested.
- Treat one-gift or one-token tests as isolated tests. Do not generalize them automatically.
- Preserve existing user changes and unrelated dirty-worktree files.
- TonTrack tracks only GRAM/jettons, Telegram Gifts and NFT sticker packs. TON DNS domains, Telegram usernames and anonymous numbers are out of scope: do not fetch, classify, store (including D1), value, estimate or display them. Server discovery drops their collections via `isExcludedIdentityNft`. Resolving a `.ton` name to a wallet address for import, and showing a `.ton` label for an address, remain allowed.

## Speed And Token Use

- Inspect only the files and functions directly involved.
- Prefer `rg` and targeted file ranges; do not repeatedly read entire large files.
- Reuse findings from the current task instead of probing the same source again.
- Stop a stalled command or network request quickly. Diagnose once, then use a simpler path.
- Avoid broad web research unless live external data or an undocumented API is essential.
- Run focused syntax/tests after edits. Use one targeted browser check for substantial UI work, not repeated visual passes.

## Data Accuracy

- Never invent, interpolate, or display guessed financial values as live data.
- Match jettons and NFTs by contract or collection address, not name or symbol alone.
- Reject stale, ambiguous, illiquid, or mismatched market data instead of showing a bogus price.
- Show a loading or unavailable state when verified data is not ready.
- Keep wallet-specific caches isolated and clear previous-wallet state on wallet changes.

## Gifts And Stickers

- Gifts and NFT stickers are different asset types; do not classify ordinary NFTs as either.
- Gift floor identity is always `collection + model + backdrop`.
- Never include `symbol` in gift floor storage, lookup, matching, or display-price selection.
- The estimation model is allowed only when the exact backdrop-level floor has `listedCount <= 1` (including a missing floor as zero listings). Never relax or replace this rule unless the user explicitly changes it.
- Gift layered media uses verified local registry assets:
  - animated model: local Lottie JSON
  - symbol: local PNG
  - backdrop: stored palette/gradient metadata
- Do not construct or guess remote media URLs at runtime.
- Unregistered layered gifts must retain their normal static image.
- Fetch one floor per unique collection/model where applicable, then reuse it for matching holdings.

## Implementation

- Follow existing vanilla JavaScript, Node.js, HTML, and CSS patterns.
- Use `apply_patch` for manual edits.
- Do not add dependencies unless the request genuinely requires one.
- Do not change API contracts used by other screens without updating and checking all callers.
- Keep production background workers separate from local preview behavior.

## Completion

- A task is complete only when the requested behavior is implemented and focused checks pass.
- A subagent handoff or implementation request is never completion evidence by itself. Before ending the task, confirm the expected edits exist in the active worktree and run the required verification locally.
- If an agent/tool session ends after delegation but before verification, resume from the worktree and finish the verification instead of reporting the delegated work as completed.
- Report what changed, what was checked, and any real limitation.
- Never claim visual or live-data verification that was not actually performed.

## Speed Rules

Use Adaptive Mode.

For simple edits:
- be fast
- minimal commands
- no browser/server verification unless asked

For research, API tracing, debugging, or unknown behavior:
- investigate properly
- do not stop after one failed path
- try at least 2-3 reasonable approaches
- report progress if stuck
- ask before editing files

Avoid only wasteful loops:
- repeated browser checks
- launching multiple servers
- waiting on stuck commands
- verifying the same thing again and again

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
