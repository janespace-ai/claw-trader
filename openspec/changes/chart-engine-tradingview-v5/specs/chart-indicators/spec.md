# chart-indicators (delta)

## ADDED Requirements

### Requirement: Catalog Grows by 4

The indicator catalog SHALL grow from 27 (klinecharts builtins)
to **31** by adding four overlays not present in klinecharts:

- **VWAP** (Volume Weighted Average Price)
- **SuperTrend** (ATR-based trend line with regime flip)
- **Ichimoku Cloud** (multi-line + filled cloud)
- **Keltner Channels** (EMA ± multiplier × ATR)

Each MUST be available in the same `IndicatorBar` row as other
overlays and behave identically with respect to persistence + cap.

#### Scenario: User toggles VWAP

- **WHEN** the user clicks 'VWAP' in the IndicatorBar overlays row
- **THEN** the chart SHALL render a VWAP line on the candle pane
- **AND**  the selection SHALL persist in
  `localStorage:claw:chart-indicators` under `overlays`.

### Requirement: Catalog Source-of-Truth Is the Registry

The indicator catalog SHALL be discovered from the
`chart-indicator-registry` capability — NOT from hardcoded arrays
in `chartIndicatorsStore` (where they currently live).  The
constants `OVERLAY_INDICATORS` and `SUBCHART_INDICATORS` in the
store SHALL be removed; the store keeps only persisted selection
state.

#### Scenario: Adding an indicator file flows through

- **GIVEN** a new file `src/chart/indicators/MFI.ts` registered
  in the registry as kind='subchart'
- **WHEN** the user opens IndicatorBar
- **THEN** 'MFI' SHALL appear in the 副图 row automatically
- **AND**  no edits to `chartIndicatorsStore.ts` SHALL be
  required.

## REMOVED Requirements

### Requirement: Hand-rolled `computeRSI` Helper
**Reason**: The hand-rolled RSI helper that survived as a stub
after the workspace-three-zone-layout cleanup is now decisively
gone — RSI's compute lives in
`src/chart/indicators/RSI.ts` via `technicalindicators.RSI`.
**Migration**: No callers to migrate (helper was already
unreferenced after `workspace-three-zone-layout` Group 8).

### Requirement: klinecharts as Backing Library
**Reason**: Replaced by Lightweight Charts v5 + technicalindicators.
**Migration**: `package.json` no longer lists `klinecharts`; the
file `src/chart/indicators/index.ts` registry replaces the
hardcoded arrays in `chartIndicatorsStore`.  No data migration —
the persisted localStorage shape (`{overlays: string[], subcharts:
string[]}`) is unchanged, so users who selected klinecharts-era
indicators (e.g. `MA`, `VOL`, `MACD`) keep their selection;
those names are valid in the new registry too.
