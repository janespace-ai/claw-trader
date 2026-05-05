# chart-indicator-registry

## Purpose

A declarative registry mapping every supported indicator to a
`compute()` function (powered by `technicalindicators`) and a
`render()` function (against Lightweight Charts series APIs).
Adding a new indicator = drop a new file under
`src/chart/indicators/<NAME>.ts` + register it in the central
`registry.ts`.  Removing or re-categorizing = a 1-line change in
the indicator's own file.

## ADDED Requirements

### Requirement: IndicatorDef Shape

Every indicator SHALL export a default object matching the
`IndicatorDef` interface:

```ts
interface IndicatorDef {
  name: string;                        // 'MA', 'BOLL', 'MACD', ...
  kind: 'overlay' | 'subchart';
  defaults: Record<string, unknown>;   // e.g. { period: 14 }
  compute(candles: Candle[], opts: object): IndicatorValue[];
  render(api: PaneRenderApi, values: IndicatorValue[]): RenderedSeries;
}
```

The registry SHALL fail an import-time assertion if any registered
indicator object does not conform.

#### Scenario: New indicator added

- **GIVEN** a contributor adds `src/chart/indicators/Stochastic.ts`
  exporting an `IndicatorDef` for Stochastic Oscillator
- **WHEN** they add `Stochastic` to the registry export
- **THEN** the new indicator SHALL appear in `IndicatorBar` under
  the appropriate row (overlay or subchart) automatically — no
  edits required to `KlineChart`, `IndicatorBar`, or the store.

### Requirement: Registry Lookup Helpers

The registry SHALL export:
- `getIndicatorDef(name: string): IndicatorDef | undefined`
- `getOverlayIndicators(): IndicatorDef[]`
- `getSubchartIndicators(): IndicatorDef[]`
- `getAllIndicatorNames(): string[]`

These SHALL be the only way components discover indicators.
Hardcoded indicator-name lists elsewhere in the codebase MUST
be removed.

#### Scenario: IndicatorBar lists all available

- **WHEN** `<IndicatorBar/>` mounts
- **THEN** it SHALL call `getOverlayIndicators()` and
  `getSubchartIndicators()` to populate its two rows
- **AND**  changes to the registry (adding/removing files) SHALL
  propagate automatically without `IndicatorBar` edits.

### Requirement: Compute Layer Powered by `technicalindicators`

Each indicator's `compute()` function SHALL delegate the math to
`technicalindicators` (or hand-rolled when the lib doesn't ship
the indicator, with a comment justifying why).  Compute functions
MUST be pure: same candles + same opts → same output.

#### Scenario: MA compute is deterministic

- **GIVEN** the same array of 200 candles
- **WHEN** `getIndicatorDef('MA').compute(candles, {periods:[5,10,30]})`
  is called twice
- **THEN** both calls SHALL return identical arrays.

#### Scenario: technicalindicators not used for hand-rolled

- **GIVEN** an indicator that `technicalindicators` does not ship
  (e.g. Keltner Channels)
- **THEN** the indicator file MUST include a comment block
  explaining why it was hand-rolled (e.g.
  `// KC = EMA ± multiplier × ATR; technicalindicators ships EMA + ATR but not KC`).

### Requirement: Render Layer Uses PaneRenderApi Facade

Each indicator's `render()` SHALL accept a `PaneRenderApi`
abstraction — NOT the raw Lightweight Charts pane object — so
that swapping chart libraries in the future requires changing
only `paneRenderer.ts`, not 31 indicator files.

#### Scenario: BOLL renders 3 lines via the facade

- **WHEN** BOLL's `render(api, values)` is called
- **THEN** it SHALL call `api.addLine({color: ..., title: 'UP', ...})`,
  `api.addLine({title: 'MID', ...})`, `api.addLine({title: 'DN', ...})`
- **AND**  it MUST NOT import from `lightweight-charts` directly.
