# chart-indicators

## Purpose

Toggle-able technical indicators on the workspace K-line.  Indicators
come in two flavors:
- **Overlay** — paint on the price scale (e.g. MA, BOLL, SAR).
- **Subchart** — stacked vertically below the main chart, sharing
  the time axis (e.g. VOL, MACD, RSI, KDJ).

User selection persists in localStorage; the same set applies to
every symbol the user views.

## ADDED Requirements

### Requirement: Indicator Catalog

The system SHALL expose at least 25 built-in technical indicators via
the K-line library, including: MA, EMA, SMA, BOLL, SAR, BBI, VOL,
MACD, KDJ, RSI, BIAS, BRAR, CCI, DMI, CR, PSY, DMA, TRIX, OBV, VR, WR,
MTM, EMV, PVT, AO.  Each indicator SHALL be classified as either
`overlay` or `subchart`.

#### Scenario: User opens the indicator picker

- **WHEN** the user clicks "+ 指标" in the K-line top bar
- **THEN** the picker SHALL list all 25+ available indicators
- **AND**  each indicator's classification (overlay vs subchart) SHALL
  determine which section of the chart it adds to when selected.

### Requirement: Indicator Selection Is Persisted

The system SHALL persist the active indicator selection (separate `overlays: string[]` and `subcharts: string[]` arrays) in `localStorage:claw:chart-indicators` and MUST apply it to every workspace session for the same browser profile.

#### Scenario: User toggles RSI on, reloads the app

- **GIVEN** localStorage has no chart-indicators entry
- **WHEN** the user clicks RSI in the picker
- **AND**  reloads the workspace tab
- **THEN** RSI SHALL still be active in the subchart stack.

### Requirement: Subchart Cap

The system SHALL allow at most **6** subchart indicators active at
once.  Adding a 7th SHALL surface a non-blocking notice ("最多 6 个子
图,先关一个再加") and the new selection SHALL NOT be applied.

#### Scenario: User has 6 subcharts and tries to add a 7th

- **GIVEN** subcharts = ['VOL','MACD','RSI','KDJ','CCI','DMI']
- **WHEN** the user clicks WR in the picker
- **THEN** an in-app notice SHALL appear
- **AND**  subcharts SHALL remain unchanged (length 6).

### Requirement: Default Indicators

On first launch (no persisted selection), the system SHALL apply a
conservative default of `overlays=['MA']` and `subcharts=['VOL']`.

#### Scenario: Fresh user opens the workspace

- **WHEN** the workspace mounts and localStorage has no
  chart-indicators entry
- **THEN** the K-line SHALL show MA on the price axis
- **AND**  a Volume subchart SHALL be rendered below the main chart.

### Requirement: Per-Indicator Removal

Each rendered subchart SHALL display a small "×" close affordance.
Clicking it SHALL remove that indicator from the active subcharts
list and persist the change.

#### Scenario: User removes the MACD subchart

- **GIVEN** subcharts contains 'MACD'
- **WHEN** the user clicks the "×" on the MACD subchart
- **THEN** MACD SHALL be removed from `subcharts`
- **AND**  the persisted localStorage value SHALL reflect the change.
