## Context

By the time this change runs, 8 screens × 2 themes × ~3-5 state baselines = ~50 visual-regression snapshots exist. Most should match their Pencil counterpart already — but the previous 9 changes were each scoped to one screen, so cross-screen consistency and the "light mode has subtle contrast issues" genre of bug haven't been specifically hunted for.

## Goals / Non-Goals

**Goals:**
- Every light-theme screen passes side-by-side with its Pencil design without qualitative complaints.
- All text/background pairs meet WCAG AA contrast.
- Cross-screen reusables (ProviderCard, StrategyCard, MetricsGrid tiles) render identically wherever they appear.
- `docs/theme-parity.md` provides evidence.

**Non-Goals:**
- Re-designing anything Pencil defined.
- Fixing dark-only issues (those should have been caught earlier).
- Adding new components or behaviors.

## Decisions

### D1. Pencil export as the reference, not screenshots taken by humans

**Decision.** Use the Pencil MCP's `export_nodes` tool to export each of the 8 light-theme frames as PNG at 2x scale. Commit these to `docs/theme-parity/pencil/<frame>.png`. Side them against Playwright-captured `__screenshots__/<screen>/light-*.png` in `theme-parity.md`.

Automates the side-by-side comparison; doesn't rely on humans remembering what Pencil said.

### D2. Contrast audit via CLI tool

**Decision.** Install `axe-core` or a CLI contrast-checker (e.g. `pa11y`) that Playwright can run against each screen in both themes. Fail on AA violations. Ship a Makefile target `make test-a11y`.

### D3. Token-bypass grep

**Decision.** Add an ESLint rule `claw/only-token-colors` that rejects hex / rgb / hsl literals in React components (outside of `.css` or `Tailwind config`). Already have `claw/no-hex-color`; this extends it to catch `rgb(255, 255, 255)`, `hsl(...)`, named colors like `"white"`.

### D4. Fixes are small, explained per-commit

**Decision.** Each audit-discovered fix is its own commit: `fix(theme): light-mode border contrast on ProviderCard`, etc. Reviewer can scan the list.

## Risks / Trade-offs

- **[Audit might surface a lot of issues]** → That's the point. But if > 30 fixes needed, pause and reassess whether individual screen changes were rushed.

- **[Automated contrast tools have false positives]** → Review manually; suppress with `aria-*` if legitimately needed.

## Migration Plan

One review pass + fix commits + docs. No runtime changes to architecture.

## Open Questions

- Should this change also audit Settings accessibility (keyboard nav, aria)? → No. Full a11y is a separate change to avoid scope creep.
