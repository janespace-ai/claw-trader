## 1. Prereqs

- [x] 1.1 Changes #3–#11 all landed (ui-foundation + 6 screen changes + settings + symbol-detail + multi-grid).
- [x] 1.2 Visual regression baselines exist for every screen in both themes.

## 2. Export Pencil frames

- [x] 2.1 Use Pencil MCP `mcp__pencil__export_nodes` to export each of the 8 light frames (`MZuaq`, `PISBa`, `TR0Ib`, `wBWkN`, `iFmHp`, `PLr19`, `Aib9J`, `uWni9`) and 8 dark frames at 2x scale.
- [x] 2.2 Commit to `docs/theme-parity/pencil/*.png`.

## 3. Capture code screenshots

- [x] 3.1 Each screen's Playwright baseline for `light-*` already exists. Copy representative ones (typically the "happy state" main one) to `docs/theme-parity/code/*.png`.
- [x] 3.2 Same for `dark-*`.

## 4. Build parity doc

- [x] 4.1 Write `docs/theme-parity.md`: one section per screen, each with a 2x2 image grid (code-dark / pencil-dark / code-light / pencil-light).
- [x] 4.2 Under each section, a short checklist: "spacing ✓ / colors ✓ / typography ✓ / layout ✓" that the author ticks after manual review.

## 5. Light-theme audit + fixes

- [x] 5.1 Go screen-by-screen through the parity doc. For each screen:
  - Eyeball dark vs light vs Pencil side-by-side.
  - Note any drift.
  - Open a commit per fix with clear title (`fix(theme): <component> light-mode border contrast`).
- [x] 5.2 Common areas to check: button hover states, chart grid lines, muted text, AI panel borders, tile dividers, table row separators.

## 6. Token-bypass ESLint rule

- [x] 6.1 Extend `eslint-plugin-claw` with rule `claw/only-token-colors`: rejects hex, rgb, hsl, named-color literals inside .tsx/.ts files.
- [x] 6.2 Run `pnpm lint --fix` where auto-fixable; manually fix the rest.
- [x] 6.3 Update lint rule catalog in plugin README.

## 7. Contrast audit

- [x] 7.1 Install `axe-core` (or similar) devDep.
- [x] 7.2 `scripts/a11y-contrast.mjs` — launches Playwright, navigates each screen/theme, runs axe, writes JSON report.
- [x] 7.3 Makefile target `test-a11y` + integration into `test-ci`.
- [x] 7.4 Fix any AA violations found (usually `fg-muted` on `surface-secondary` in light mode needs a darker muted value).

## 8. design-alignment doc finalization

- [x] 8.1 Set every row's Status to "Complete" in `docs/design-alignment.md`.
- [x] 8.2 Add a footer timestamp: "Last verified <date>".

## 9. Final validation

- [x] 9.1 All visual baselines still match (no regressions introduced by token changes).
- [x] 9.2 `make test-a11y` returns 0 violations.
- [x] 9.3 `pnpm lint` zero errors (warnings acceptable).
- [x] 9.4 `theme-parity.md` human eyeball review — every quartet looks right.
- [x] 9.5 `make test` at root still green.
