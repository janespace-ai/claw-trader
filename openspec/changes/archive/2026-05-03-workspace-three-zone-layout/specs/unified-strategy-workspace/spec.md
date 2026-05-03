# unified-strategy-workspace (delta)

## REMOVED Requirements

### Requirement: Three-Pane Workspace Layout
**Reason**: The original spec described three side-by-side resizable
panes with the center pane holding three tabs (code / chart / result).
The new layout splits the center vertically (persistent K-line on top,
3-tab content area below) and the left rail no longer reflects
`draft_symbols`.  See the new "Three-Zone Workspace Layout"
requirement below for the replacement.
**Migration**: Components `SymbolListPane`, `WorkspaceCenterPane`, and
`StrategyChatPane` are kept as the named seams but their internals are
restructured (see tasks.md Group 2).  No data-model migration.

## ADDED Requirements

### Requirement: Three-Zone Workspace Layout

The workspace SHALL render three zones:
- **Left zone** (`SymbolListPane`, fixed 280px): full-market universe,
  see capability `workspace-universe-rail`.
- **Center zone** (`WorkspaceCenterPane`, flex-grow): vertically split
  into a fixed-height TOP (`SymbolKlinePane`, 420px) showing the
  focused symbol's K-line + symbol info bar, and a flex-grow BOTTOM
  (`WorkspaceTabsPane`) with three tabs `[选出的币 | 代码 | 回测]`.
- **Right zone** (`StrategyChatPane`, fixed 360px): AI chat (unchanged).

The K-line in the center TOP SHALL be visible regardless of which
center BOTTOM tab is active.

#### Scenario: Initial mount

- **WHEN** the workspace tab is opened
- **THEN** the layout SHALL render the three zones with the above
  dimensions
- **AND**  the K-line SHALL show data for `focusedSymbol`
  (default = `draft_symbols[0]` if any, else `"BTC_USDT"`)
- **AND**  the BOTTOM tab SHALL default to `选出的币`.

#### Scenario: User switches between BOTTOM tabs

- **GIVEN** BOTTOM tab is `代码`
- **WHEN** the user clicks `回测`
- **THEN** the BOTTOM SHALL swap to the result viewer
- **AND**  the K-line in the TOP SHALL remain visible and unchanged.

### Requirement: Focused Symbol Mutex

There SHALL be exactly one source of truth for `focusedSymbol`
(workspace-level UI state).  Both the left rail rows and the
"选出的币" tab's draft-chip + filtered-table rows SHALL highlight
their row only when the row's symbol equals `focusedSymbol`.  Setting
`focusedSymbol` from one panel SHALL automatically remove the
highlight from the other panel.

#### Scenario: Click filtered list row

- **GIVEN** left-rail BTC_USDT row is highlighted
  (`focusedSymbol === "BTC_USDT"`)
- **WHEN** the user clicks an SOL_USDT row inside the
  "选出的币" tab's filtered table
- **THEN** `focusedSymbol` SHALL become `"SOL_USDT"`
- **AND**  the BTC_USDT row in the left rail SHALL lose its highlight
- **AND**  the SOL_USDT row in the filtered table SHALL gain the
  highlight
- **AND**  the K-line SHALL re-render for SOL_USDT.

#### Scenario: Focused symbol persists when tab switches

- **GIVEN** `focusedSymbol === "ETH_USDT"`
- **WHEN** the user switches BOTTOM tab from `选出的币` to `代码`
- **THEN** `focusedSymbol` SHALL remain `"ETH_USDT"` and the K-line
  SHALL still show ETH_USDT.

#### Scenario: Default on first mount

- **GIVEN** strategy has `draft_symbols=["XRP_USDT","DOGE_USDT"]`
- **WHEN** the workspace mounts and `focusedSymbol` is unset
- **THEN** `focusedSymbol` SHALL be initialized to `"XRP_USDT"`
  (`draft_symbols[0]`).

#### Scenario: Default when draft is empty

- **GIVEN** strategy has `draft_symbols=[]`
- **WHEN** the workspace mounts and `focusedSymbol` is unset
- **THEN** `focusedSymbol` SHALL be initialized to `"BTC_USDT"`.

### Requirement: Strong Tab Auto-Switch on AI Output

The active BOTTOM tab SHALL switch unconditionally to the tab matching newly-emitted AI content (filter result → 选出的币; applied code diff → 代码; backtest result → 回测).  The switch MUST fire even if the user is currently viewing a different tab; no soft red-dot indicator is permitted.

#### Scenario: AI emits filtered symbol list

- **GIVEN** BOTTOM tab is `代码`
- **WHEN** the AI's screener completes and `lastFilteredSymbols` is
  updated
- **THEN** BOTTOM tab SHALL switch to `选出的币`.

#### Scenario: AI emits a code diff that the user accepts

- **GIVEN** BOTTOM tab is `回测`
- **WHEN** the user clicks "应用" on a diff card and `draft_code`
  updates
- **THEN** BOTTOM tab SHALL switch to `代码`.

#### Scenario: Backtest result arrives

- **GIVEN** BOTTOM tab is `选出的币`
- **WHEN** an auto-fired or manually-fired backtest completes
  (`last_backtest` populated)
- **THEN** BOTTOM tab SHALL switch to `回测`.
