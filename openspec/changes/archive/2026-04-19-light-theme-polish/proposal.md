## Why

After changes #3–#11 ship, every screen has dark + light visual-regression baselines. But they were each captured in isolation, once per screen. Two issues emerge in practice:

1. **Subtle token drift** — e.g. a button `border-subtle` value looks fine in dark but has insufficient contrast in light. Each screen change may have handled its own case but not done a repo-wide audit.
2. **Cross-screen consistency** — a given Pencil reusable (e.g. `ProviderCard`, `StrategyCard`) gets used in only one screen per change; a repo-wide pass can catch inconsistencies we missed.

This change runs a final sweep focused on Light theme correctness and publishes an archive of side-by-side screenshots against Pencil.

## What Changes

**Repo-wide light-mode audit**:
- Run every visual-regression baseline on Light theme with MSW `happy` profile.
- Compare each against the matching Pencil frame (`MZuaq`, `PISBa`, `TR0Ib`, `wBWkN`, `iFmHp`, `PLr19`, `Aib9J`, `uWni9`) using either the Pencil MCP `export_nodes` + diff, or side-by-side manual review.
- File issues / fix drift in this change.

**Token consistency pass**:
- Grep repo for any `fill`, `stroke`, `color`, `background-color` CSS uses that bypass tokens.
- Confirm all values resolve to the `$surface-*`, `$fg-*`, `$border-*`, `$accent-*` families.
- Run `lighthouse-theme-contrast` (or equivalent) to verify AA contrast ratios on all text/background pairs in both themes.

**Documentation**:
- `docs/theme-parity.md` — for each of 8 screens, a PNG quartet (dark-code / dark-design / light-code / light-design) committed as reference.
- Update `docs/design-alignment.md` — mark every row's Status as "Complete".

**Bug fix commits** as needed per the audit. Typical issues expected:
- 1-2 buttons where hover state was only tested in dark
- 1-2 charts where grid lines are too light on light bg
- Edge AI-panel borders inconsistent

## Capabilities

### New Capabilities
- None strictly new. This is the closing quality pass.

### Modified Capabilities
- `ui-foundation`: any token fix affects primitives here.
- `ui-workspace-*`: per-screen fixes.

## Impact

**New files**
- `docs/theme-parity.md` + `docs/theme-parity/*.png` (quartet reference images)

**Modified files**
- Various token / component fixes surfaced by the audit — expected small, surgical
- `docs/design-alignment.md` — final Status column update

**Depends on**
- All of #3–#11 landed (this is the final cleanup)

**Out of scope**
- Re-designs. If a visual "feels wrong" but matches Pencil, Pencil is right.
- Accessibility beyond contrast ratio (full a11y audit is separate).
