# Theme parity — Pencil ↔ code, per screen

A closing quality pass after changes #3–#11 land. Each screen gets a
2×2 image matrix — **code dark / Pencil dark / code light / Pencil
light** — so drift between the implemented UI and the design file is
visible at a glance.

The four images per screen live under:

- `docs/theme-parity/pencil/<frame-id>.png` — exported from Pencil via
  `mcp__pencil__export_nodes` at 2× scale
- `docs/theme-parity/code/<screen>-<theme>.png` — captured from
  Playwright visual regression baselines

All baselines are regenerated with `pnpm test:visual:update` on a
clean MSW `happy` fixture profile.

## Review checklist (per screen)

Tick each item after side-by-side inspection:

- [ ] Spacing — padding / margin / gap values match design
- [ ] Colors — tokens resolve to the same hue families in both themes
- [ ] Typography — font family, weight, size match
- [ ] Layout — grid/flex structure and breakpoints match

## Screens

### 1. Strategy Design — `Q6cKp` (dark) / `MZuaq` (light)

Code: `screens/workspace/StrategyDesign.tsx`

- [ ] Spacing  [ ] Colors  [ ] Typography  [ ] Layout

### 2. Preview Backtest — `3PSG8` (dark) / `PISBa` (light)

Code: `screens/workspace/PreviewBacktest.tsx`

- [ ] Spacing  [ ] Colors  [ ] Typography  [ ] Layout

### 3. Deep Backtest — `QdrlI` (dark) / `TR0Ib` (light)

Code: `screens/workspace/DeepBacktest.tsx`

- [ ] Spacing  [ ] Colors  [ ] Typography  [ ] Layout

### 4. Multi-Symbol Grid — `nvBnq` (dark) / `wBWkN` (light)

Code: `components/workspace/CrossSymbolGrid.tsx` (rendered inside
Preview + Deep when `workspaceStore.viewMode === 'grid'`)

- [ ] Spacing  [ ] Colors  [ ] Typography  [ ] Layout

### 5. Screener (chart-first) — `bnwnL` (dark) / `iFmHp` (light)

Code: `screens/ScreenerScreen.tsx`

- [ ] Spacing  [ ] Colors  [ ] Typography  [ ] Layout

### 6. Strategy Management — `pGjNd` (dark) / `PLr19` (light)

Code: `screens/StrategiesScreen.tsx`

- [ ] Spacing  [ ] Colors  [ ] Typography  [ ] Layout

### 7. Symbol Detail — `s9ooT` (dark) / `Aib9J` (light)

Code: `screens/SymbolDetailScreen.tsx`

- [ ] Spacing  [ ] Colors  [ ] Typography  [ ] Layout

### 8. Settings — `0qnH2` (dark) / `uWni9` (light)

Code: `screens/SettingsScreen.tsx`

- [ ] Spacing  [ ] Colors  [ ] Typography  [ ] Layout

## How to regenerate

```bash
# Exports every light + dark Pencil frame to docs/theme-parity/pencil/
make pencil-export

# Regenerates Playwright baselines, which are then copied into
# docs/theme-parity/code/ by the same script.
pnpm --prefix desktop-client test:visual:update
scripts/copy-theme-parity.sh
```

The checklist items above are ticked in separate follow-up commits
titled `fix(theme): <component> <issue>` so the audit trail is clear.
