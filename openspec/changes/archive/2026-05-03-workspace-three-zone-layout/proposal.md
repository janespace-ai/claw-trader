# Workspace Three-Zone Layout

## Why

The unified-strategy-workspace v1 left rail shows the **current strategy's
`draft_symbols` only**.  Three problems surfaced once we used the screen
end-to-end:

1. **You can't browse the market while editing a strategy.**  The left
   rail used to be the screener / coin-list page.  Replacing it with
   `draft_symbols` made the workspace feel claustrophobic — users want
   to glance at "what's BTC doing right now?" without leaving the
   strategy they're authoring.
2. **K-line lives inside a tab and disappears.**  The current center
   pane has 3 tabs (code / chart / result) and only one is visible at
   a time.  The K-line — the most-stared-at piece of any trading UI —
   vanishes the moment a user switches to "code" or "result".
3. **Filtered coin lists from AI have nowhere good to land.**  When the
   user says "筛 24h 成交额 top 30", the result currently goes straight
   into `draft_symbols`.  There is no "preview list → cherry-pick → add"
   step, so users either accept all 30 or reject all 30.

This change re-balances the screen:

```
Left = full universe (browse market)
Center TOP = persistent K-line of the focused symbol (always visible)
Center BOTTOM = 3 tabs (选出的币 / 代码 / 回测) (AI products land here)
Right = AI chat (unchanged)
```

## What Changes

- **BREAKING (UI only, no data)**: `SymbolListPane` (left rail) switches
  data source from `strategy.draft_symbols` to a new `useUniverseStore`
  that loads ~200 symbols from `/api/symbols`.  No backend change.
- **NEW**: `focusedSymbol` ephemeral UI state (Zustand) — single source
  of truth for "which symbol's K-line is showing".  Mutex-highlighted
  in **both** the left rail and the "选出的币" tab (only one row glows
  at a time, across both panels).
- **NEW**: `WorkspaceCenterPane` is split into a fixed-height top zone
  (`SymbolKlinePane`, 420px) and a flex-grow bottom zone
  (`WorkspaceTabsPane`).  K-line is **always** visible regardless of
  which bottom tab is active.
- **NEW**: `WorkspaceTabsPane` reduces from 3 tabs to a focused 3:
  - **选出的币** — upper section "草稿 (N)" chips of `draft_symbols`,
    lower section "上次 AI 筛出 (M)" table of the most recent
    AI-screener result with per-row "+ 加入草稿".
  - **代码** — `draft_code` editor (replaces current "code" tab).
  - **回测** — backtest result viewer (replaces current "result" tab).
- **NEW**: AI-screener result no longer auto-populates `draft_symbols`.
  It writes to a separate `lastFilteredSymbols` field on the strategy
  session and surfaces in the "选出的币" tab where the user explicitly
  cherry-picks via "+ 加入" or "+ 全部加入草稿".
- **CHANGED**: Tab auto-switch policy — when AI emits new content, the
  bottom tab **strongly switches** to the new content's tab (per
  product decision Q1=c).  No red-dot soft mode.
- **REMOVED**: The old "chart" tab inside the center pane (K-line is
  now permanent at top, no longer a tab).
- **REMOVED**: Per-strategy "draft_symbols are visible in the left
  rail" assumption.  Anywhere that semantic was relied on (e.g. tests
  asserting `SymbolListPane` content) needs updating.

## Capabilities

### New Capabilities

- `workspace-universe-rail`: full-market symbol browser as the left
  rail of the workspace (search, pagination, focused-symbol click
  binding).  Disconnected from any strategy's `draft_symbols`.

### Modified Capabilities

- `unified-strategy-workspace`: the "Three-Pane Workspace Layout"
  requirement is **REMOVED** and replaced by a new "Three-Zone Workspace
  Layout" requirement (left universe / center split / right chat).
  Adds new "Focused Symbol Mutex" and "Strong Tab Auto-Switch on AI
  Output" requirements.  Other requirements (save-strategy, symbols
  frozen snapshot, status badge, single-active-session) unchanged.
- `coin-screening-ui`: the "AI-Initiated Symbol Filtering Inside
  Workspace" requirement is rewritten — AI-screener results land in a
  new `lastFilteredSymbols` strategy-session field and surface in the
  "选出的币" tab, NOT directly in `draft_symbols`.  The user
  cherry-picks via "+ 加入" / "+ 全部加入草稿".

## Impact

- **desktop-client**:
  - New: `src/stores/universeStore.ts`, `src/stores/focusedSymbolStore.ts`
    (or merged into existing `appStore`).
  - Modified: `src/components/workspace/SymbolListPane.tsx` (data source
    swap), `WorkspaceCenterPane.tsx` (vertical split), tabs reduced
    from 3 to 3 with different content.
  - Modified: `src/screens/StrategyWorkspaceScreen.tsx` (compose new
    panes, wire focused-symbol mutex).
  - New: `src/components/workspace/SymbolKlinePane.tsx`,
    `FilteredSymbolsTab.tsx`.
- **service-api**: no backend change.  `/api/symbols` and the existing
  screener endpoints already cover the data needs.
- **tests**: ~6 vitest specs need updating where they assert that
  left-rail rows reflect `draft_symbols`.
- **Pencil**: 3 new frames added (`A7ubw`, `V8qt9`, `O8TIU2`); the old
  `OUv6E` master is kept but marked as superseded in the hand-off doc.
- **i18n**: 4 new strings (universe header, search placeholder,
  "草稿 / 上次 AI 筛出" section headers, "+ 加入草稿" button).
