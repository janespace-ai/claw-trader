# workspace-universe-rail (delta)

## ADDED Requirements

### Requirement: Rows Display Last Price + 24h % Change

Each universe row SHALL display, in addition to the symbol identifier:
the last price (formatted by magnitude — see scenario) and the 24h
percent change with green-up / red-down coloring.

#### Scenario: Symbol with full market data

- **GIVEN** the row's symbol has `last_price=67432.10` and
  `change_24h_pct=2.41`
- **THEN** the row SHALL render `BTC_USDT` on the left
- **AND**  `67,432.10` and `+2.41%` (green) stacked on the right
- **AND**  prices ≥ 1000 SHALL use thousand-separators with 2 decimals
- **AND**  prices < 1 SHALL use 4-6 decimals depending on magnitude
- **AND**  prices in `[1, 1000)` SHALL use 2 decimals.

#### Scenario: Symbol with missing market data

- **GIVEN** the row's symbol has `last_price=null` (cold cache)
- **THEN** the row SHALL render `—` in the price slot
- **AND**  the 24h % slot SHALL also render `—` with no color tint.

### Requirement: Row Click Behavior Unchanged

The price/24h fields SHALL be visual-only and MUST NOT alter the
existing row-click semantics: clicking still sets `focusedSymbol`
and only updates the K-line above.

#### Scenario: User clicks the price area of a row

- **WHEN** the user clicks anywhere on the row including the price
  text
- **THEN** the same `setFocusedSymbol(row.symbol)` call SHALL fire
- **AND**  no additional event (no detail modal, no copy-to-clipboard)
  SHALL trigger.
