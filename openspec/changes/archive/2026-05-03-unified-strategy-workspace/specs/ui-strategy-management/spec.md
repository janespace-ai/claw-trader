# ui-strategy-management (delta)

## ADDED Requirements

### Requirement: Library Cards Show Chat Snippet

Library cards SHALL display the most recent chat message preview (one
line, ≤ 80 chars, role-prefixed).  Strategies without chat history
SHALL show a placeholder "—".

#### Scenario: Strategy with messages

- **GIVEN** a strategy whose last assistant message is "已筛出 11 个币种"
- **THEN** the library card SHALL render "AI: 已筛出 11 个币种" truncated to ≤ 80 chars.

#### Scenario: Strategy with no messages

- **GIVEN** a strategy with no chat_messages rows
- **THEN** the library card SHALL render "—" in the snippet position.

### Requirement: Library Cards Show Backtest PnL Pill

Cards SHALL render a colored PnL pill from `last_backtest.summary.pnl_pct`:
green (≥0), red (<0), gray (no backtest).

#### Scenario: Profitable last run

- **GIVEN** strategy.last_backtest.summary.pnl_pct = 18.3
- **THEN** the card SHALL render a green pill labeled "+18.3%".

#### Scenario: No backtest yet

- **GIVEN** strategy.last_backtest is null
- **THEN** the card SHALL render a gray pill labeled "—".

### Requirement: Filter By Saved/Draft Status

The library SHALL provide a chip-based filter set including "已保存",
"草稿", "归档草稿", in addition to the existing favorite / archived
filters.

#### Scenario: Apply 草稿 filter

- **GIVEN** the library has 3 saved + 2 draft + 1 archived-draft strategies
- **WHEN** the user activates the "草稿" chip
- **THEN** only the 2 draft rows SHALL render.

## MODIFIED Requirements

### Requirement: Strategy Click Action
A click on a strategy card SHALL navigate to the unified workspace tab
(not the legacy strategy-design route) and load the strategy's
draft_code, draft_symbols, full chat history, and last_backtest into
the workspace.

#### Scenario: Click loads full session

- **GIVEN** a saved strategy with 30 chat messages
- **WHEN** the user clicks the card
- **THEN** the app SHALL navigate to the unified workspace tab AND
  the chat pane SHALL show all 30 messages scrolled to bottom.

## REMOVED Requirements

### Requirement: code_type Filter (strategy / screener)
**Reason**: With the merge, screener-only entries no longer exist as
separate library items.  Filter chips for code_type are removed; the
"strategies" tab now lists every Strategy regardless of whether it
contains screener-style or trading-strategy code (in practice, every
saved strategy has both).
