# desktop-light-mockups Specification

## Purpose
TBD - created by archiving change design-desktop-light-mockups. Update Purpose after archive.
## Requirements
### Requirement: Light-theme mockup coverage

The Pencil source file `design/trader.pen` SHALL contain a fully drawn light-theme mockup for every top-level desktop-client screen listed below. Each mockup MUST be a distinct top-level frame with `theme: {mode: "light"}` set on its root node and MUST render at the dimensions declared for its corresponding dark variant.

Covered screens (8):

| Screen | Light frame ID | Dark frame ID | Dimensions |
|--------|---------------|---------------|------------|
| Workspace — Strategy Design | `MZuaq` | `Q6cKp` | 1440×900 |
| Workspace — Preview Backtest | `PISBa` | `3PSG8` | 1440×900 |
| Workspace — Deep Backtest | `TR0Ib` | `QdrlI` | 1440×900 |
| Multi-Symbol Grid | `wBWkN` | `nvBnq` | 1440×900 |
| Screener (chart-first) | `iFmHp` | `bnwnL` | 1440×900 |
| Strategy Management | `PLr19` | `pGjNd` | 1440×900 |
| Symbol Detail | `Aib9J` | `s9ooT` | 1440×900 |
| Settings | `uWni9` | `0qnH2` | 1440×1800 |

#### Scenario: All eight frames exist with correct IDs and theme

- **WHEN** a reviewer inspects `design/trader.pen` with `get_editor_state` or `batch_get`
- **THEN** each of the eight frame IDs in the table above is present as a top-level node
- **AND** each has `theme: {mode: "light"}` set on its root
- **AND** each has `width` and `height` matching the dimensions column

#### Scenario: No dark-only frame was deleted or renamed

- **WHEN** a reviewer inspects the top-level nodes
- **THEN** the eight dark-theme frames (`bnwnL`, `pGjNd`, `s9ooT`, `0qnH2`, `Q6cKp`, `3PSG8`, `QdrlI`, `nvBnq`) still exist unchanged

### Requirement: Token-only color values

Every `fill`, `stroke`, and text `fill` property on any descendant of the eight light-theme frames SHALL resolve to one of the theme-aware variables defined in the file's `variables` block (`$surface-*`, `$fg-*`, `$border-*`, `$accent-*`, `$accent-*-dim`), OR to an intentional absolute color documented in `design.md` (e.g. a brand logo, a chart grid gridline color, or an AI-generated image fill). Hard-coded hex values for UI surfaces, text, or borders are not allowed.

#### Scenario: Property audit reveals no stray hex values

- **WHEN** `search_all_unique_properties` is run against each of the eight light-theme frame IDs for `fillColor`, `textColor`, and `strokeColor`
- **THEN** every returned value is either a `$`-prefixed variable reference or appears in the approved absolute-color list in `design.md`

### Requirement: Visual parity with dark variants

Each light-theme screen SHALL mirror the layout, component composition, spacing, and copy of its corresponding dark screen. Acceptable differences are limited to:

1. Colors resolved through `mode: light` tokens.
2. Placeholder text or numeric values may differ if the dark variant's value would be misleading on a white surface (e.g. a dark-mode-tuned tooltip string that references "dim glow").
3. The Settings screen's active theme indicator MAY reflect "Light" as selected on the light mockup while the dark mockup reflects "Dark".

#### Scenario: Side-by-side visual parity

- **WHEN** a reviewer exports PNG screenshots of a dark frame and its light counterpart at the same scale
- **THEN** the two images share the same panel grid, the same component boundaries, and the same text blocks in the same positions

#### Scenario: Settings active-theme indicator

- **WHEN** a reviewer inspects the Settings theme toggle on the light mockup (`uWni9`)
- **THEN** the "Light" option is shown as the active selection
- **AND** a "System" option is present alongside "Dark" and "Light"

### Requirement: Candle convention is green-up / red-down

Every candlestick mockup rendered on any of the eight light-theme frames SHALL use `$accent-green` fills and strokes for up-candles and `$accent-red` for down-candles. The red-up convention variant is NOT drawn; it is represented only by a toggle shown in the Settings screen mockup.

#### Scenario: Candlestick palette matches default convention

- **WHEN** a reviewer inspects any candlestick body, wick, or border on a light-theme chart mockup
- **THEN** up-candle fills reference `$accent-green` (or `$accent-green-dim` for transparent overlays) and down-candle fills reference `$accent-red` (or `$accent-red-dim`)

### Requirement: English-only copy

All text content on the eight light-theme frames SHALL be authored in English. The Chinese-language variant is explicitly out of scope for this change.

#### Scenario: No zh-CN frames added

- **WHEN** a reviewer inspects the top-level frame list after this change is applied
- **THEN** no new frame's name contains "中文", "zh-CN", "zh", "Chinese", or Chinese-language content
- **AND** every text node on the eight light-theme frames renders Latin-character copy

### Requirement: Each screen passes a screenshot visual review

After drawing a screen, the author SHALL capture a screenshot via `mcp__pencil__get_screenshot` for the screen's root frame ID and confirm:

1. No body child overflows the frame bounds.
2. No text node is invisible (i.e. `fill` color and the nearest surface color have perceptible contrast).
3. No panel retains a dark-mode surface color against siblings that correctly resolved to light.

#### Scenario: Screenshot verification logged per screen

- **WHEN** the `tasks.md` sub-task for a screen is marked complete
- **THEN** the author has captured at least one screenshot of that screen's root frame during the work
- **AND** the captured image shows the issues above absent

### Requirement: Runtime code is untouched

This change SHALL NOT modify any file outside `design/trader.pen` and the `openspec/` change directory. Specifically, no source under `desktop-client/`, `data-aggregator/`, `service-api/`, `docker/`, or config roots is edited.

#### Scenario: Git diff scope check

- **WHEN** `git status` is run after applying all tasks
- **THEN** the only modified paths are `design/trader.pen` and files under `openspec/changes/design-desktop-light-mockups/` and `openspec/specs/desktop-light-mockups/` (on archive)
