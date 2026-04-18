## Context

`design/trader.pen` is the canonical Pencil mockup for the `desktop-client` Electron app. It already defines:

- **Theme axis** `mode: [dark, light]` with fully resolved tokens for `surface-*`, `fg-*`, `border-*`, `accent-*` in both modes (verified via `get_variables`).
- **9 reusable components** (`ScrRow`, `StrategyCard`, `TradeRow`, `ProviderCard`, `RailRow`, `PTradeRow`, `RailRow8`, `MetTile`, `GridCell`) that already bind to those theme tokens — so swapping `theme: mode` on a frame is enough to flip the component palette.
- **8 fully drawn dark screens** laid out in a 2×4 grid on the canvas: Workspace Strategy Design, Workspace Preview Backtest, Workspace Deep Backtest, Multi-Symbol Grid, Screener (chart-first), Strategy Management, Symbol Detail, Settings.
- **8 light-theme stub screens** (`MZuaq`, `PISBa`, `TR0Ib`, `wBWkN`, `iFmHp`, `PLr19`, `Aib9J`, `uWni9`) already placed in the right-hand half of the canvas (`x ∈ [3040, 4560]`) with `theme: {mode: "light"}` applied to the root, but their body content is either a bare copy of the dark layout or empty placeholders. These stubs are what this change completes.

The light-theme runtime in the app already works (driven by `data-theme` attribute + CSS custom properties), but there is no authoritative visual spec to review it against.

## Goals / Non-Goals

**Goals:**

- Every one of the 8 light stub screens renders as a **complete, presentable mockup** at 1440×900 (Settings is 1440×1800) with all panels, tables, charts, and controls populated with representative content.
- All colours come from **theme-aware variables**, never hex literals — so if a token is tweaked, every mockup updates uniformly. This matches how the runtime theme works.
- **Visual parity with the dark variants**: layout, spacing, typography, component usage, and copy match the dark screens 1:1. Differences are limited to what the `mode: light` token resolution already produces (surface whites, darker text, softer accent greens/reds/purple).
- The **green-up / red-down** candle convention is used in all chart mockups (matches the app's default setting). The `red-up` variant is not drawn — documentation only.
- Node IDs of the 8 stub frames are **preserved** so any external reference or screenshot caption stays valid.

**Non-Goals:**

- Chinese (`zh-CN`) copy — all mockup text stays English. Runtime i18n is already handled by `react-i18next`.
- Dark-theme frames — untouched.
- New screens (onboarding, login, error states, dialogs) — only the 8 existing top-level frames are in scope.
- Pixel-perfect 1:1 with the live React UI — the mockup is the spec, not the other way around. Minor copy / placeholder-data differences are acceptable.
- Component-library additions — reuse the 9 existing reusable components. Only add a new reusable component if a screen needs a widget that doesn't exist and would be duplicated ≥ 3 times.
- Code changes of any kind — no `.tsx`, `.go`, `.yaml`.

## Decisions

### D1: Finish stubs in place, preserve node IDs

**Choice:** Complete the 8 existing stub frames (`MZuaq`, `PISBa`, `TR0Ib`, `wBWkN`, `iFmHp`, `PLr19`, `Aib9J`, `uWni9`). Do **not** create fresh frames and delete the stubs.

**Rationale:** Each stub already has `theme: {mode: "light"}` applied at the root, is positioned in the right canvas grid, and carries stable IDs that may be referenced externally. Rebuilding from scratch would churn IDs and reshuffle layout for no visual gain.

**Alternative considered:** Delete the 8 stubs and duplicate each dark frame with `C()` + theme override. Rejected because it invalidates IDs and doubles the work of repositioning.

### D2: Reuse dark-screen layouts verbatim, let tokens resolve

**Choice:** Each light screen mirrors its dark counterpart's layout tree. Content (strings, numeric values, chart shapes) should be identical or minor variations. No layout re-design for light.

**Rationale:** The whole point of the theme axis is that one layout works in both modes. The visual difference comes entirely from token resolution. This also keeps the design cheap to maintain — when the dark version evolves, the light version should get the same treatment in a follow-up change.

**Alternative considered:** Design light as a separate visual language (e.g. different grid, different density). Rejected — inconsistency would confuse reviewers and force duplicate maintenance forever.

### D3: Cloning strategy — `batch_design` `C()` operation per major panel

**Choice:** For each stub, copy the dark counterpart's body subtree into the stub's body frame using `C(sourceId, destParent)`, then walk the copy and null out any `theme: {mode: "dark"}` overrides so the ancestor's `mode: light` wins.

**Rationale:** The `C()` copy operation in `batch_design` handles deep trees atomically and produces fresh IDs for children, which is what we want for the descendants (only the root screen ID needs preservation). Anything the copy inherits via variable references (e.g. `fill: "$surface-primary"`) automatically re-resolves under the new theme.

**Alternative considered:** Manually re-insert each component and set each property. Rejected as tedious (~500 nodes per screen) and error-prone.

### D4: Chart visuals — rasterized path mockups, not live data

**Choice:** Candlestick bodies/wicks, equity curves, drawdown curves, RSI subcharts, and monthly heatmaps are drawn as static rectangles / paths with representative shapes. No attempt to embed real market data.

**Rationale:** Pencil is a layout tool, not a charting library. The dark screens already use this static-path approach; the light versions will match. Reviewers care that the axes, legends, and palette are right — not that the OHLC matches a real symbol.

### D5: Green-up / red-down only

**Choice:** All candlestick mockups use `$accent-green` for up-candles and `$accent-red` for down-candles.

**Rationale:** This is the app's default. The red-up Asian convention is a user setting and does not need its own mockup — a Settings screen toggle is drawn showing the option exists.

### D6: Skip `zh-CN` mockups

**Choice:** Per the user's explicit direction, no separate Chinese-language frames are drawn. Mockup copy is English.

**Rationale:** The runtime uses `react-i18next` with a complete `zh-CN` bundle; string rendering is a runtime concern, not a layout concern. A Chinese mockup would duplicate 8 screens for no layout difference.

### D7: Verify every finished screen with `get_screenshot`

**Choice:** After completing each screen, invoke `mcp__pencil__get_screenshot(nodeId)` and verify:
- No overflow (body children don't extend past the frame).
- No stray dark-mode color pockets (e.g. a nested panel that hard-coded `#0A0A0A`).
- Text legible against its surface (white-on-white or near-white-on-near-white is a bug).
- Chart palette matches `mode: light` accent values.

**Rationale:** Design regressions are cheap to spot visually but invisible in JSON. This is standard Pencil workflow (the MCP guidelines mandate it).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Deep copy with `C()` includes a descendant that hard-codes a dark-mode color literal (e.g. `#FFFFFF` text on a white surface becomes invisible). | After copying each screen, run `search_all_unique_properties` on the new tree for `fillColor` / `textColor` and confirm every color is either a `$variable` reference or an intentional absolute (e.g. a brand logo). Fix any stragglers with `replace_all_matching_properties`. |
| Preserving the 8 stub IDs while replacing their children means the existing children may have sub-IDs that conflict with copied IDs. | Before copying, `D()`-delete every existing direct child of the stub's body frame (but not the stub root or its top-bar wrapper that already holds correct light styling). Then copy into the now-empty body. |
| Screenshot verification is per-screen, so a shared component bug (e.g. `ScrRow`) might pass on one screen and fail on another if content differs. | Sanity-check each of the 9 reusable components in isolation by screenshotting the component itself under `theme: mode: light` before starting the screens. |
| 25-op cap on `batch_design` per call means each screen needs 2–4 calls. | Plan each screen's ops into logical sections (top bar, left rail, main panel, right rail) so each call stays under 25 ops and each chunk is self-checkable. |
| Chinese users reviewing mockups may want to see zh copy. | Out of scope this iteration; call it out in the proposal. A follow-up change can add a zh mockup pass if needed. |
| Design drift between dark and light variants if future edits only touch one side. | Not mitigated here — a future convention-level change could introduce a "design-pair" rule. For now, rely on code review. |

## Approved absolute colors

These hex literals are intentionally theme-independent and appear in both dark and light mockups. They are **not** violations of the "token-only" rule:

| Hex | Purpose |
|-----|---------|
| `#00000000` | Fully transparent fill (no-op fill for enabled:false states). |
| `#00000099` | 60%-alpha black overlay (tooltip scrim, modal backdrop). |
| `#3bc9db` | Cyan indicator line (RSI / MACD signal). Same value in dark and light by design so chart overlays stay recognisable across themes. |
| `#A855F755 → #A855F700` gradient stops | Decorative purple fade on `StrategyCard / sparkFill` and `GridCell / gcCanvas`. Pencil gradient stops can't reference variables; accepted as-is. |
| `#ffffffcc` | Tooltip/scrim white 80%. Fixed value, identical across themes. |
| `#4285f444` | Google Brand Blue 27% alpha — background of the Google Gemini provider card logo tile on the Settings screen. Brand identity must stay constant across themes. |
| `#1a1a2a`, `#262626`, `#a1a1aa`, `#a855f7` | Pixel-art fills inside the Settings → Appearance → Theme picker's "Dark" preview swatch. These represent what the Dark theme looks like and must stay dark even when the current theme is Light. Symmetric: `#ffffff`, `#e8e8e8`, `#525252`, `#7c3aed` fill the "Light" preview swatch and stay light even when the current theme is Dark. |

## Migration Plan

Not applicable — this is a design-asset change. No deploy, no rollback. If a screen turns out wrong after merge, re-open the change, fix the specific frame, and re-verify with screenshots.

## Open Questions

- **Q1**: Should the Settings screen's theme toggle in the light mockup visually show the "Light" option as the active one, or mirror the dark mockup (which shows "Dark" active)? *Proposed answer: yes, active = Light on the light mockup, active = Dark on the dark mockup — matches what the user would see at runtime.*
- **Q2**: Do we draw a "System" theme option alongside Dark/Light? *Proposed answer: yes, three-button group `Dark | Light | System`, matches the runtime.*
- **Q3**: Should the AI Chat strategy-summary cards in the Workspace screens show DeepSeek-specific or provider-agnostic copy? *Proposed answer: provider-agnostic. Provider identity appears only on the Settings → LLM Providers screen.*
