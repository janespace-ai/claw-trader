# workspace-universe-rail

## Purpose

The workspace's left rail is a **full-market symbol browser** — a
read-only view of every symbol the data-aggregator has bars for
(typically the top ~200 by 24h volume).  It exists so users can glance
at the market while authoring a strategy, without leaving the
workspace.  It is intentionally **decoupled** from any strategy:
clicking a symbol does NOT add it to `draft_symbols`; it only changes
which symbol's K-line is shown in the center-top zone (`focusedSymbol`
state).

## ADDED Requirements

### Requirement: Universe Data Source

The left rail SHALL load its rows from `GET /api/symbols` (existing
endpoint).  Rows SHALL display: symbol identifier (e.g. `BTC_USDT`),
last price, and 24h percent change with green/red color coding.  The
rail MUST NOT consult `strategy.draft_symbols` or any other
strategy-scoped state.

#### Scenario: Workspace mounts with active strategy

- **GIVEN** the workspace tab is open with strategy S whose
  `draft_symbols=["XRP_USDT"]`
- **WHEN** the page mounts and the universe loads
- **THEN** the left rail SHALL show ALL ~200 symbols ordered by 24h
  volume descending, NOT only `["XRP_USDT"]`.

#### Scenario: User switches between strategies

- **GIVEN** strategy A is loaded; user clicks library and loads
  strategy B
- **THEN** the left rail content SHALL be unchanged (same ~200
  symbols) because the universe is strategy-agnostic.

### Requirement: Universe Search

The rail SHALL provide a single search input above the list.  Typing
filters the visible rows by case-insensitive substring match on the
symbol identifier (matched against the part before `_USDT`).

#### Scenario: User types "BT"

- **WHEN** the user enters "bt" in the search box
- **THEN** the list SHALL show rows whose identifier contains "BT"
  (e.g. `BTC_USDT`, `WBTC_USDT`)
- **AND**  the focused-symbol highlight SHALL persist if the focused
  symbol still matches the filter; otherwise no row glows.

### Requirement: Click Sets Focused Symbol

Clicking a row in the universe SHALL set the workspace's
`focusedSymbol` to that row's symbol identifier.  No other state
change SHALL occur (no chat message, no draft mutation, no backtest).

#### Scenario: User clicks ETH_USDT row

- **GIVEN** `focusedSymbol === "BTC_USDT"`
- **WHEN** the user clicks the ETH_USDT row
- **THEN** `focusedSymbol` SHALL become `"ETH_USDT"`
- **AND**  the K-line above SHALL re-render for ETH_USDT
- **AND**  `strategy.draft_symbols` SHALL NOT change
- **AND**  no chat message SHALL be appended.

### Requirement: Universe Excludes Strategy State

The universe data fetch and rendering SHALL NOT depend on any value in
the `strategySessionStore`.  Adding/removing symbols from a strategy's
`draft_symbols` MUST NOT trigger a universe re-fetch or re-render
beyond the focused-symbol highlight update.

#### Scenario: User adds BTC to draft_symbols

- **GIVEN** universe is rendered with 200 rows
- **WHEN** user clicks "+ 加入草稿" on BTC inside the "选出的币" tab,
  causing `draft_symbols` to mutate
- **THEN** the universe rows MUST NOT re-render or re-sort
- **AND**  the BTC row in the universe MUST NOT visually change (no
  star, no checkmark, no draft indicator).
