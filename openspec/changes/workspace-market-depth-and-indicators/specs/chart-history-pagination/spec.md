# chart-history-pagination

## Purpose

Lazy-load older K-line bars when the user pans the workspace chart
leftward.  Replaces the prior "fetch latest 100 and stop" behavior
so the user can scroll back through months of history without an
explicit "load more" button.

## ADDED Requirements

### Requirement: Initial Load Window

On focusedSymbol change, the system SHALL fetch the most recent **200**
K-line bars for the focused symbol at the active interval and render
them in the main chart.

#### Scenario: User clicks SOL_USDT in the universe rail

- **WHEN** focusedSymbol changes from `BTC_USDT` to `SOL_USDT`
- **THEN** the system SHALL call `getKlines({ symbol: 'SOL_USDT',
  interval, limit: 200 })`
- **AND**  the chart SHALL render those 200 bars with the most recent
  bar at the right edge.

### Requirement: Pan-Triggered Older-Bar Fetch

The system SHALL fetch up to 200 older bars via `getKlines({ to: oldest_loaded_ts - 1, limit: 200 })` and prepend them to the rendered series whenever the leftmost rendered bar's logical index falls within 20 bars of the chart's start.

#### Scenario: User pans the chart leftward

- **GIVEN** the chart has 200 bars loaded, oldest_loaded_ts = T
- **WHEN** the user pans so that the leftmost visible bar's logical
  index is ≤ 20 from start
- **THEN** the system SHALL call `getKlines({ to: T-1, limit: 200 })`
- **AND**  prepend the returned bars to the chart series, deduped by `ts`.

### Requirement: Single-Flight + Debounce

The history loader SHALL be debounced (250 ms) and SHALL drop new
fetch attempts while a fetch is already in flight.

#### Scenario: User pans rapidly

- **GIVEN** a history fetch is currently in flight
- **WHEN** the visible-range listener fires again within 250 ms
- **THEN** the system SHALL NOT issue a second fetch
- **AND**  a single result SHALL be appended on completion.

### Requirement: End-of-History Detection

When a history fetch returns fewer than 200 bars, the system SHALL
mark the loader as `endOfHistory=true` for the current symbol +
interval and SHALL NOT issue further fetches until the symbol or
interval changes.

#### Scenario: Backend returns 14 bars

- **WHEN** a fetch returns only 14 older bars (next call would be
  empty)
- **THEN** the loader SHALL mark `endOfHistory=true`
- **AND**  subsequent pan-leftward events SHALL NOT trigger fetches
  until focusedSymbol or interval changes.

### Requirement: Reset on Symbol or Interval Change

Changing `focusedSymbol` or the K-line interval SHALL reset the
history loader: clear loaded candles, clear `endOfHistory`, fetch
fresh initial 200.

#### Scenario: User switches interval from 15m to 1h

- **GIVEN** chart shows 800 bars of 15m data with endOfHistory=true
- **WHEN** the user clicks "1h" in the interval picker
- **THEN** the chart SHALL clear and re-fetch the latest 200 bars at
  1h interval
- **AND**  endOfHistory SHALL be reset to false.
