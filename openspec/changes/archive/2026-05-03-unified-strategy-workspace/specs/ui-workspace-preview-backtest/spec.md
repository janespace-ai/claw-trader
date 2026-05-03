# ui-workspace-preview-backtest (delta)

## REMOVED Requirements

### Requirement: Preview Backtest Mode Within Workspace
**Reason**: Preview-backtest as a distinct mode is collapsed.  The
unified workspace's auto-backtest (Decision Q2) is the new "preview"
— it runs once on the first complete pair, results show inline in
the center pane's result tab, and there is no separate
`workspaceStore.mode = 'preview'` state.
**Migration**: Routes / IPC events that referenced the preview mode
land in the unified workspace with the result tab pre-selected.

### Requirement: 7-Day Default Range For Preview Runs
**Reason**: Replaced by per-strategy default in the unified workspace
that derives from `BacktestConfig.lookback_days` saved on the strategy.
Defaults still 7 days for first run if not specified.

## ADDED Requirements

### Requirement: Result Tab Inside Unified Workspace
The unified workspace center pane SHALL include a "结果" tab that:
- Shows aggregate metrics + per-symbol drill-down (per
  multi-symbol-backtest-results capability)
- Auto-activates when auto-backtest completes
- Displays last_backtest from the strategy (cached) when re-opening
  an existing strategy

#### Scenario: Re-open a strategy with a cached backtest

- **GIVEN** an existing strategy whose last_backtest was populated
  in a prior session
- **WHEN** the user clicks the strategy in the library and the
  workspace mounts
- **THEN** the center pane SHALL default to the "结果" tab and render
  the cached aggregate + per-symbol drill-down without re-running.
