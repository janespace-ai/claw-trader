## Why

The desktop client already ships a token-driven `data-theme` switch (dark ↔ light), but the Pencil source of truth at `design/trader.pen` only has **fully drawn dark variants** — the 8 light-theme frames (`iFmHp`, `PLr19`, `Aib9J`, `uWni9`, `MZuaq`, `PISBa`, `TR0Ib`, `wBWkN`) are still stubs carrying the dark layout with `theme: {mode: "light"}` but no resolved light surface/ink/accent colors or visible content.

Designers and reviewers currently have nothing to compare the runtime light theme against, which blocks (a) visual-QA of the in-app light mode, (b) marketing screenshots, and (c) any future iteration on light-specific affordances (e.g. green-up / red-down conventions vs. red-up / green-up, chart gridline contrast on white).

## What Changes

- Produce **complete, pixel-polished light-theme mockups** inside `design/trader.pen` for all 8 application screens, replacing the stub copies in place (same node IDs retained so existing references stay valid).
- Finalize the light-mode values for the existing `--surface-*`, `--fg-*`, `--border-*`, `--accent-*` variables under the `mode: light` theme axis so the mockups render cleanly against a white substrate.
- **Out of scope**: the Chinese-language variant of the mockups (`zh-CN` screenshots). Only English copy is drawn; i18n is handled at runtime.
- **Out of scope**: the dark-theme frames (unchanged). This change does not touch `bnwnL`, `pGjNd`, `s9ooT`, `0qnH2`, `Q6cKp`, `3PSG8`, `QdrlI`, `nvBnq`.
- **Out of scope**: any runtime / code changes. This is a design-asset-only deliverable — no `.tsx`, `.go`, or config edits.

## Capabilities

### New Capabilities

- `desktop-light-mockups`: Authoritative Pencil design source for every top-level desktop screen rendered under the light theme. Defines which screens exist, what node ID each one uses, what its content must show, and the shared visual token set it must resolve against.

### Modified Capabilities

_(none — runtime theming, screener, backtest, settings, etc. are unaffected.)_

## Impact

- **Affected file**: `design/trader.pen` (Pencil design, encrypted — only touched via `mcp__pencil__*` tools).
- **Affected code**: none.
- **Affected APIs**: none.
- **Dependencies**: the existing Pencil MCP server; no new tooling.
- **Downstream consumers**: design-review process, screenshot assets in README / marketing, and future visual-regression testing of the desktop client's light theme.
