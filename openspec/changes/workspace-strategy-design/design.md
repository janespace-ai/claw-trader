## Context

Pencil frame `Q6cKp` shows a chart-centered workspace where users iterate on a strategy *idea* with AI support before committing to a backtest run. The bottom-right "Ready for preview" card is the key UX affordance: it appears **only when** a strategy draft is parseable, and its CTA transitions the user to the Preview workspace.

Key design interactions visible in the mock:
1. User has some intent → types into AI composer → assistant streams response with both explanation prose AND Python code inside a ` ```python ` block.
2. A structured summary ("strategy type / condition / params") appears as a card inline in chat, separate from the raw code.
3. Below the chart, a "Strategy draft" card crystallizes that summary with editable params.
4. The purple "Run Preview" card appears on the right.
5. Clicking Run Preview transitions the whole screen to the Preview workspace.

This change has to ship: screen layout, strategist persona (prompt + output parser), draft persistence, and the Preview transition.

## Goals / Non-Goals

**Goals:**
- Pixel-level match of both `Q6cKp` (dark) and `MZuaq` (light).
- AI Strategist persona that reliably emits: Python code + structured summary (parseable).
- Draft persistence across page reloads (SQLite) and across workspace transitions (zustand).
- "Run Preview" works end-to-end: click → task submitted → workspace transitions.
- Existing Strategies page continues to work.

**Non-Goals:**
- Version history UI (Strategy Management's job).
- Preview backtest rendering (next change).
- Multi-symbol strategy design — scope is one symbol per design session.
- Real-time code evaluation / syntax highlighting beyond what `CodeBlock` already does.

## Decisions

### D1. Strategist prompt emits BOTH prose AND structured JSON in a code fence

**Decision.** System prompt instructs the AI to respond with a prose explanation (1-3 paragraphs) followed by two fenced blocks:

```
\`\`\`json summary
{ "name": "...", "interval": "...", "symbols": [...], "longCondition": "...", "shortCondition": "...", "params": {...} }
\`\`\`

\`\`\`python
class MyStrategy(Strategy):
    ...
\`\`\`
```

The parser (`parsers.parseStrategistOutput(rawText): { prose, summary?, code? }`) extracts both. Rendering order: prose → summary card (if present) → code block (collapsible).

**Alternatives considered.**
- **Structured outputs API (function calling)** — more reliable but provider-specific (OpenAI/Anthropic differ) and we support 5 providers. Fenced-JSON parsing is universal.
- **Summary inferred from code** — fragile; code is free-form Python.
- **Two separate messages** — streaming nicer as one message.

**Consequence.** If the AI fails to emit valid JSON, we fall back to rendering just the prose + code. No fatal error.

### D2. Draft strategy auto-saves as a new version on each parseable summary

**Decision.** When the strategist persona emits a parseable `summary + code` pair, we call `cremote.createStrategyVersion({ strategy_id, body: { code, summary: summary.name + ": " + <brief>, parent_version: currentVersion } })`. If no `strategy_id` exists yet (fresh design session), we first call `cremote.createStrategy({ name, code_type: "strategy", code })` then create the v1.

Reason: version tree is central to Strategy Management's UX. Auto-saving ensures history exists without asking the user to remember.

**Alternatives considered.**
- **Save only on explicit Save button** — loses history during iteration, which is when it matters most.
- **Save to local SQLite only, not remote** — breaks the "backend is source of truth for strategies" story.

### D3. Run Preview submits a `preview` mode backtest and transitions on task creation (not completion)

**Decision.** The button click does `cremote.startBacktest(...)` and *immediately* (on task_id receipt) transitions `workspaceStore.mode = "preview"`. Preview workspace renders a loading state while polling.

This way the user sees something happen; the network wait is in Preview's scope, not Design's.

**Alternatives considered.**
- **Block on completion** — slow; bad UX.
- **Fire-and-forget transition** — we do transition; we just also store the task_id so Preview can poll.

### D4. Strategy draft card is editable for params only, not code

**Decision.** The "Strategy draft" card below the chart shows:
- Long condition (read-only, from summary)
- Short condition (read-only)
- Leverage (read-only)
- Params table (editable — numeric inputs, updates send new backtest config)

Code is hidden (view-only in the AI chat's collapsible `<details>`). If the user wants to edit code, they open the `Code` tab (appears in later Deep workspace change, not here).

**Rationale.** Non-technical users iterate via params + chat, not via code edits. Power users can still edit the code via the Strategies page.

### D5. Topbar CTA state machine

**Decision.** The `Run Preview` button has three states:
- **Disabled** — no parseable draft yet (empty state or after AI error)
- **Ready** — draft exists, shows "✦ Run preview" in accent purple (matches Pencil `$accent-primary`)
- **Running** — after click, shows "…" spinner until `mode` transitions

Attempting Run Preview with a compilable-but-semantically-empty strategy (e.g. returns `pass`) still fires — backtest-engine will produce a result with 0 trades. Not our concern here.

### D6. Summary card uses the resurrected `StrategySummaryCard` component

**Decision.** `StrategySummaryCard.tsx` exists as orphaned code from a previous attempt. We wire it in. The `onApply` callback in the old signature becomes the draft-persistence path (already auto-runs; no button needed).

Remove `onApply` + `onDismiss` from the component; they're vestigial.

### D7. Pixel fidelity: spacing lifts from Pencil, confirmed by visual regression

**Decision.** Re-measure `Q6cKp` node positions in Pencil and translate to absolute Tailwind classes. No "close enough" — if Pencil says `gap-3` between elements, we use `gap-3` (12px in our scale). Visual regression catches everything else.

## Risks / Trade-offs

- **[AI emits malformed JSON in the summary block]** → Fallback: render prose + code only, skip the summary card + auto-save. User re-prompts.

- **[Version auto-save spams history]** → Expected 1-5 versions per design session. That's fine for the Pencil version tree UX. If a user iterates 50 times, the tree scrolls; not ugly.

- **[Run Preview button race condition]** → Debounce: disable for 500ms after click. User can't double-submit.

- **[Prompt prompts for specific symbol context]** → The prompt includes `focusedSymbol` so it's not generic advice. Good. But if user switches symbol mid-chat, context drifts. For now, we reset the prompt on symbol change and show a subtle notice in chat: "Symbol switched to ETH_USDT; previous advice may not apply".

- **[Strategy draft card params editing hasn't been designed]** → Pencil doesn't show the editable state. We're inventing the UX: inline numeric inputs with immediate commit (no Save button), debounced 800ms. Iterate later.

## Migration Plan

1. Implement screen + persona wiring + transitions.
2. Wire route to render this screen when `route.kind === "workspace" && workspaceStore.mode === "design"`.
3. Keep old `BacktestPage` rendering for `route.kind === "workspace" && mode !== "design"` until Preview/Deep ship in #5/#6.
4. Visual regression baselines captured.

Rollback: commit revert. No data migrations.

## Open Questions

- The purple "Ready for preview" card looks like it has animated shimmer in the mock (subtle). Ship without shimmer? → Yes. Shimmer is easy to add later; gate on "after we ship the baseline screen."
- Strategies page's "duplicate and improve" entry — does it set the current strategy + enter Workspace Design? → Yes, in Strategy Management change #8 it hooks into Design via `navigate({ kind: "workspace", strategyId: <id> })` + `workspaceStore.enterDesign(id)`.
- Should the chart show a preview of generated entry/exit markers **before** running a backtest? → Mock doesn't suggest it. Skip.
