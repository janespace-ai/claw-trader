# multi-symbol-backtest-results

## Purpose

The result surface for a backtest with N>1 symbols.  Shows aggregate
metrics across all symbols plus a sortable per-symbol drill-down so the
user sees "this strategy is great on majors but loses money on small
caps".  Required because the existing UI only ever sent N=1; the
backend has supported `BacktestConfig.symbols: string[]` since
inception but no UI exercised it.

## ADDED Requirements

### Requirement: Aggregate Metrics Section

The result surface SHALL display aggregate metrics computed across all
symbols in the run: total PnL %, sharpe, max drawdown %, win rate, and
a single equity curve plotted with one tick per symbol-bar (collapsed
in chronological order).

#### Scenario: 5-symbol backtest finishes

- **GIVEN** a backtest of 5 symbols completes with positive aggregate PnL
- **WHEN** the result tab activates
- **THEN** the top section SHALL display the 5 metric tiles (PnL %,
  sharpe, max DD, win rate, total trades) AND a single combined equity
  curve covering all symbols.

### Requirement: Per-Symbol Drill-Down Table

Below the aggregate view the result surface SHALL render a sortable
table with one row per symbol, showing: symbol, PnL %, sharpe, win
rate, trade count.  Default sort: PnL desc.

#### Scenario: Click a symbol row

- **WHEN** the user clicks a row
- **THEN** the workspace SHALL navigate to a per-symbol view showing
  that symbol's k-line chart with strategy buy/sell signal markers and
  its individual equity curve.

### Requirement: Filter By Outcome

The drill-down table SHALL provide a filter chip set: "全部 / 盈利 /
亏损 / 持平".  Selecting one filters rows accordingly without re-running
the backtest.

#### Scenario: Click 亏损 filter

- **GIVEN** a 5-symbol result where 2 had pnl_pct < 0
- **WHEN** the user clicks the 亏损 chip
- **THEN** the drill-down table SHALL render only those 2 rows
- **AND**  the equity curve SHALL stay unchanged (filter only affects
  the table).

### Requirement: Result Persists With Strategy

The most recent backtest result SHALL be cached on
strategy.last_backtest so re-opening the strategy shows the result
immediately, without re-running.  The cached payload includes per-symbol
breakdowns (not just the aggregate).

#### Scenario: Strategy with stale last_backtest

- **GIVEN** strategy.last_backtest exists from 3 days ago AND
  has_workspace_changes=true
- **THEN** the workspace SHALL show the cached result with a banner
  "结果可能已过时——上次运行: 3 天前 [重新跑]".
