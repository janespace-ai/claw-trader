# chart-engine

## Purpose

The workspace's main K-line viewer is implemented on top of
TradingView Lightweight Charts v5 (Apache 2.0).  This capability
defines the chart-engine boundary: what `KlineChart` accepts, what
it renders, and how it interacts with the rest of the workspace.

Other chart components (EquityCurve, DrawdownCurve, MonthlyHeatmap)
also use Lightweight Charts v5 but are NOT part of this capability —
they're static post-backtest visualizations with their own simple
APIs.

## ADDED Requirements

### Requirement: KlineChart API Surface

`<KlineChart>` SHALL accept exactly four props: `symbol: string`,
`interval: string`, `loadBars: (req) => Promise<{bars, hasMoreBackward}>`,
and an optional `height: number` (default 560 px).  The component
MUST own all chart instance lifecycle and indicator orchestration
internally; the parent has no access to the underlying chart object.

#### Scenario: Mount and unmount

- **WHEN** `<KlineChart symbol="BTC_USDT" interval="5m" loadBars={fn}/>` mounts
- **THEN** the component SHALL create exactly one Lightweight Charts
  v5 instance scoped to its container
- **AND**  on unmount SHALL call `chart.remove()` and clear the
  container's innerHTML.

#### Scenario: Symbol change

- **GIVEN** `KlineChart` is mounted with `symbol="BTC_USDT"`
- **WHEN** the parent re-renders with `symbol="ETH_USDT"`
- **THEN** the chart SHALL clear its candle data and reload via
  `loadBars({type: 'init', ...})` for the new symbol.

### Requirement: Multi-Pane via Lightweight Charts v5 Native API

The chart SHALL use Lightweight Charts v5's `chart.addPane()` API
to render subchart indicators in their own panes.  It MUST NOT
spawn additional `createChart()` instances for subcharts.

#### Scenario: Adding a subchart indicator

- **GIVEN** `KlineChart` is mounted with the candle pane only
- **WHEN** the indicator selection adds 'MACD' to subcharts
- **THEN** the chart SHALL call `chart.addPane()` to create a new
  pane below the candle pane
- **AND**  add MACD line + signal + histogram series into that pane
- **AND**  the new pane SHALL share the candle pane's time axis.

### Requirement: Pan-to-Load-Older History

The chart SHALL detect leftward pan via Lightweight Charts'
`timeScale().subscribeVisibleTimeRangeChange` and request older
bars from the parent's `loadBars` callback.  Same single-flight
+ debounce + dedup-by-timestamp policy as the prior implementation.

#### Scenario: User pans leftward to the start

- **GIVEN** the chart has 200 bars loaded with oldest_loaded_ts=T
- **WHEN** the user pans so that `range.from` is within ~20 bars of T
- **THEN** the chart SHALL call
  `loadBars({type: 'backward', timestamp: T})` once
- **AND**  prepend the returned bars (deduped by timestamp) to the
  candle series and to every active indicator series.

#### Scenario: End of history

- **WHEN** `loadBars` returns `{bars: [...], hasMoreBackward: false}`
- **THEN** the chart MUST NOT call `loadBars` again until `symbol`
  or `interval` changes.

### Requirement: Scroll-to-Real-Time on Initial Data

The chart SHALL position the visible window so the most recent bar is glued near the right edge after the initial bars land (via `loadBars({type: 'init'})`), with a small offset for new-bar growth room.

#### Scenario: First load completes

- **WHEN** the initial `loadBars` resolves with N bars
- **THEN** the chart SHALL call
  `chart.timeScale().scrollToRealTime()` (or v5 equivalent) so the
  rightmost rendered bar is the most recent one returned
- **AND**  set a small right-edge offset (~10 % of the visible bar
  width) so new bars have growth room.

### Requirement: Theme Token Binding

The chart SHALL source all colors (background, grid, text, candle up/down, crosshair) from CSS custom properties defined by the design system (`--surface-primary`, `--border-subtle`, `--accent-green`, `--accent-red`, `--fg-muted`, etc.) and MUST re-apply them in place — without recreating the chart instance — whenever the theme flips (via `useSettingsStore.candleConvention` or a future dark/light toggle).

#### Scenario: Candle convention flips

- **GIVEN** chart is showing red-up=false (default green-up)
- **WHEN** `candleConvention` flips to `'red-up'`
- **THEN** the chart SHALL recolor candles via
  `series.applyOptions({upColor, downColor, ...})` without
  recreating the series.

### Requirement: Container Resize Handling

The chart SHALL observe its container with a `ResizeObserver` and
call `chart.resize()` (or v5 equivalent) on every size change,
debounced to one call per animation frame.  Initial paint MUST
happen at the container's actual width even when that width is
zero at `init()` time (typical first-render race).

#### Scenario: Workspace AI panel toggled

- **GIVEN** chart is rendered at 800 px wide
- **WHEN** the AI panel collapses, expanding the chart container
  to 1100 px
- **THEN** the chart SHALL re-measure and re-render at 1100 px
  within one animation frame.
