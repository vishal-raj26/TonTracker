# TonTrack Working Rules

## Communication

- Before editing, state exactly what will change in one or two sentences.
- If the request is ambiguous, ask one concise question before implementation.
- Keep progress updates and final responses short.
- Do not repeat explanations the user already accepted.

## Scope

- Make the smallest change that fully satisfies the current request.
- Do not redesign, refactor, research, or modify adjacent screens unless requested.
- Treat one-gift or one-token tests as isolated tests. Do not generalize them automatically.
- Preserve existing user changes and unrelated dirty-worktree files.

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