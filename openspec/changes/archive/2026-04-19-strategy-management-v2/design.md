## Context

The current strategies page is a reasonable first pass but lacks the history / card richness Pencil calls for. Versioning is now available in the contract (`api-contract-new-capabilities`), so the UI can finally expose it.

## Goals / Non-Goals

**Goals:**
- Pixel match `pGjNd` + `PLr19`.
- Each card shows a mini equity curve from its most recent backtest (if any).
- Version history panel fully wired: list, revert, duplicate-and-improve.
- Actions chain cleanly: Duplicate opens in Workspace Design with a fresh strategy record.

**Non-Goals:**
- Inline code editing (stays in Workspace).
- Graphical diff viewer (text diff is enough for v1).
- Bulk operations on multiple strategies.

## Decisions

### D1. Mini equity curve pulls from latest backtest, not strategy itself

**Decision.** `StrategyCard` fetches the most recent `backtestHistory({ strategy_id, limit: 1 })` in the background. If any exists, pull its `summary.equity_curve` (short-slice) for the mini chart. If none, show a placeholder "No backtests yet" in place of the mini chart.

This means the card is read-heavy — N strategies = N backtest-history lookups. Mitigation: a single batch endpoint would help (`POST /api/backtest/history-bulk` with strategy_ids[]). Out of this change's scope; ship with per-card fetch first, optimize if performance is bad.

### D2. Strategy History panel is a persona, but composer disabled

**Decision.** Reuse `AIPersonaShell` for consistency, but the `strategy-history` persona has:
- Intro: "Version history for {strategy_name}"
- Transcript: rendered version list (not a chat history)
- Composer: **disabled** — no user input
- Buttons per version: `Revert` / `Duplicate and improve`

Minimal "AI-ness", but fits the slot layout.

### D3. Revert = new version, not rollback

**Decision.** Reverting to v3 doesn't delete v4/v5; it creates a new v6 whose code is a copy of v3's code, with summary "Revert to v3". History is immutable.

Rationale: matches version-control mental model; no data loss.

### D4. Duplicate = new strategy record

**Decision.** Click Duplicate on a card → `cremote.createStrategy({ name: "{original} (copy)", code_type, code, params_schema })` with the **current version's** code, then navigate to Workspace Design with the new strategy id. User can immediately iterate.

### D5. Tabs + search are client-side filtering

**Decision.** Load all strategies into `strategyStore.list` (paginated scroll for > 50), then filter client-side by tab (is_favorite, status) and search (name match). No server filtering needed at current scale.

### D6. Card actions via menu + direct clicks

**Decision.** Card has:
- Whole-card click → `Open` (navigate to Workspace Design)
- Favorite star → toggle (stopPropagation)
- Three-dot menu → Duplicate / Archive / (future: Export)

## Risks / Trade-offs

- **[Per-card backtest-history fetch is N+1]** → N = typically < 30 strategies in UX; acceptable. Batch if measured to be slow.

- **[Reverting to old code may have compatibility issues]** → If strategy depends on an indicator that's been removed from the sandbox framework, the revert creates a new version that won't backtest. Acceptable — user sees error on next Run Preview, can fix manually.

- **[Version tree visualization is list, not graph]** → Linear list is enough for v1. Branching (via `parent_version`) rendered as tree-style indent. Graph view is a stretch future feature.

## Migration Plan

1. Implement `StrategiesScreen` alongside old `StrategiesPage`.
2. Switch route in a single PR.
3. Delete old file.

## Open Questions

- Does "New Strategy" take the user to Workspace with a truly blank state, or show a template picker first? → Blank state. Templates are a future feature.
- Should Archive hide from Open (Workspace) lookup too? → No; archived strategies can still be opened, just hidden from the default grid.
