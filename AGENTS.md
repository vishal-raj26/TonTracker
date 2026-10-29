# TonTrack Working Rules

## Username Rebuild Continuity

- When resuming the Telegram username estimator rebuild, read `docs/USERNAME_REBUILD_CHECKPOINT.md` first, then the current worktree and its linked source-of-truth document. Do not restart completed work from older handovers.
- Update that checkpoint after material changes, including verification results, pending commands and exact next steps. Keep unresolved valuation-quality issues marked incomplete.

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

## Telegram Username Estimator Rebuild Exception

When the user explicitly requests work on rebuilding, redesigning, researching,
evaluating, or improving the Telegram username estimator, treat that task as
an authorized architecture/research/refactor task.

For that task only:

- The agent may inspect all files, database structures, APIs, workers, caches,
  services, frontend consumers, and documentation materially connected to
  Telegram username valuation.
- The agent may redesign or replace the existing estimator architecture when
  evidence shows a better architecture is warranted.
- The agent may perform external web/API/market research needed to understand
  current Telegram collectible username markets, Fragment, TON data sources,
  comparable sales, historical sales, and valuation methods.
- The agent may edit relevant files without asking for approval again after
  stating what it intends to change.
- The agent may change estimator-related internal API/database contracts when
  necessary, but must update and verify every affected caller.
- New dependencies are allowed only when they provide a meaningful advantage
  and the reason is documented.
- Existing username-estimator documentation, formulas, scoring weights,
  assumptions, prompts, heuristics, and architecture are historical reference,
  NOT canonical requirements. Audit them independently and retain only what
  can be justified.
- Do not preserve a legacy estimator behavior merely for compatibility if it
  materially damages valuation quality.
- TON DNS valuation documentation remains canonical for TON DNS only. Do not
  automatically apply TON DNS assumptions or valuation architecture to
  Telegram usernames.
- Preserve unrelated TonTrack functionality and unrelated user changes.
- The task is not complete until the implementation is tested and its valuation
  behavior is evaluated against real historical examples where possible.

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
- Before changing TON DNS discovery, pricing, AI classification, market ingestion, storage, or UI valuation states, read `docs/TON_DNS_VALUATION_SOURCE_OF_TRUTH.md` and `docs/TON_DNS_ESTIMATOR_IMPLEMENTATION_PLAN.md`. Treat them as the canonical product, architecture, and implementation records for this feature.

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
