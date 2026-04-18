## 1. Preflight

- [x] 1.1 Open `design/trader.pen` via `mcp__pencil__get_editor_state` and confirm all 8 dark screens and 8 light stubs listed in `specs/desktop-light-mockups/spec.md` are present.
- [x] 1.2 Run `mcp__pencil__get_variables` and confirm `mode: light` values exist for every `surface-*`, `fg-*`, `border-*`, `accent-*` token. All 20 variables have both dark and light entries.
- [x] 1.3 Inspect the 9 reusable components — all bind to `$variable` references; no hex literals in their source trees except the documented gradient-stop exceptions (`StrategyCard / sparkFill`, `GridCell / gcCanvas`).

## 2. Screen — Workspace / Strategy Design (Light) — `MZuaq`

- [x] 2.1 Placeholder not needed — the stub was already a full copy of dark `Q6cKp` with `theme:{mode:"light"}` on root.
- [x] 2.2 Same — no destructive edit required.
- [x] 2.3 Same — subtree already present and rethemes correctly via root theme cascade.
- [x] 2.4 `search_all_unique_properties` on `MZuaq` — every fill/stroke/text color resolves to a light-mode token or an approved absolute from `design.md`.
- [x] 2.5 AI chat panel already uses provider-agnostic "AI Strategist" label with English summary cards.
- [x] 2.6 `get_screenshot(MZuaq)` verified: white substrate, readable text, green-up/red-down candles, purple Run Preview CTA, no overflow, no dark pockets.
- [x] 2.7 No placeholder to remove.

## 3. Screen — Workspace / Preview Backtest (Light) — `PISBa`

- [x] 3.1 Stub already a complete copy of dark `3PSG8` with `theme:{mode:"light"}` root — no placeholder cycle needed.
- [x] 3.2 Skipped (no empty required).
- [x] 3.3 Skipped (tree already present).
- [x] 3.4 Color audit passed after substituting dark-mode accent alphas with light-mode accent alphas (green `#16a34a15`/`#16a34a11`, yellow `#d9770633`/`#d9770622`/`#d9770644`) via `replace_all_matching_properties`.
- [x] 3.5 Candle palette confirmed: `$accent-green` up / `$accent-red` down. Equity curve uses `$accent-primary` purple.
- [x] 3.6 `get_screenshot(PISBa)` verified.
- [x] 3.7 No placeholder to remove.

## 4. Screen — Workspace / Deep Backtest (Light) — `TR0Ib`

- [x] 4.1 Stub was a complete copy of dark `QdrlI` with `theme:{mode:"light"}` root.
- [x] 4.2 Skipped.
- [x] 4.3 Skipped.
- [x] 4.4 Color audit + substitution pass done (same pass as §3).
- [x] 4.5 Drawdown curve uses `$accent-red-dim` fill + `$accent-red` stroke; monthly heatmap cells use `$accent-green` / `$fg-muted` / `$accent-red` ramp.
- [x] 4.6 Symbol ranking table (left rail) and trade list (bottom) mirror the dark variant's structure.
- [x] 4.7 `get_screenshot(TR0Ib)` verified.
- [x] 4.8 No placeholder to remove.

## 5. Screen — Multi-Symbol Grid (Light) — `wBWkN`

- [x] 5.1 Stub was a complete copy of dark `nvBnq` with `theme:{mode:"light"}` root.
- [x] 5.2 Skipped.
- [x] 5.3 Skipped.
- [x] 5.4 Color audit passed.
- [x] 5.5 Each `GridCell` instance resolves correctly under light — cell background `$surface-secondary`, mini-chart purple `$accent-primary`, pnl badge uses green/red accents.
- [x] 5.6 `get_screenshot(wBWkN)` verified.
- [x] 5.7 No placeholder to remove.

## 6. Screen — Screener / chart-first (Light) — `iFmHp`

- [x] 6.1 Stub was a complete copy of dark `bnwnL` with `theme:{mode:"light"}` root.
- [x] 6.2 Skipped (top bars `l0tv7` / `rSN2d` already correct).
- [x] 6.3 Skipped.
- [x] 6.4 Color audit passed.
- [x] 6.5 Screener DSL pane uses a readable light syntax palette — identifiers in `$fg-primary` (near-black), keywords in `$accent-primary` purple, strings in `$accent-green`, numbers in `$accent-yellow`.
- [x] 6.6 `ScrRow` rows alternate against `$surface-primary` / `$surface-secondary` — confirmed.
- [x] 6.7 `get_screenshot(iFmHp)` verified.
- [x] 6.8 No placeholder to remove.

## 7. Screen — Strategy Management (Light) — `PLr19`

- [x] 7.1 Stub was a complete copy of dark `pGjNd` with `theme:{mode:"light"}` root.
- [x] 7.2 Skipped.
- [x] 7.3 Skipped.
- [x] 7.4 Color audit passed.
- [x] 7.5 Each `StrategyCard` instance's status pill uses the right accent — Active `$accent-green`, Paused `$accent-yellow`, Archived `$fg-muted`.
- [x] 7.6 `get_screenshot(PLr19)` verified.
- [x] 7.7 No placeholder to remove.

## 8. Screen — Symbol Detail (Light) — `Aib9J`

- [x] 8.1 Stub was a complete copy of dark `s9ooT` with `theme:{mode:"light"}` root.
- [x] 8.2 Skipped.
- [x] 8.3 Skipped.
- [x] 8.4 Color audit passed.
- [x] 8.5 RSI subchart bands use `$accent-red-dim` / `$accent-green-dim` overlays with `$fg-muted` axis ticks.
- [x] 8.6 Trade markers (`arrowUp`/`arrowDown`/`circle`) match the green-up convention (`$accent-green` for long entries, `$accent-red` for short).
- [x] 8.7 `get_screenshot(Aib9J)` verified.
- [x] 8.8 No placeholder to remove.

## 9. Screen — Settings (Light) — `uWni9`

- [x] 9.1 Stub was a complete copy of dark `0qnH2` with `theme:{mode:"light"}` root.
- [x] 9.2 Skipped.
- [x] 9.3 Skipped.
- [x] 9.4 Color audit passed.
- [x] 9.5 **Fix applied**: active theme indicator swapped from "Dark" (`8HaSj`) to "Light" (`v4TGy`). Purple stroke/dim-fill moved to Light; Dark now shows plain `$surface-tertiary` background. Row text + icon swapped accordingly (Dark: `moon` icon + `$fg-primary` label; Light: purple check-circle + `$accent-primary` bold label).
- [x] 9.6 Three-option segmented control present: `Auto | Dark | Light` (Auto = System, same semantic as spec's "Dark | Light | System").
- [x] 9.7 LLM provider cards (OpenAI / Anthropic / DeepSeek / Google Gemini / Moonshot) render under light tokens. Google's brand blue (`#4285f444`) documented as approved absolute.
- [x] 9.8 Candle-convention toggle present, set to `Green-up / Red-down` (active).
- [x] 9.9 Full 1440×1800 rendered, no overflow.
- [x] 9.10 No placeholder to remove.

## 10. Final verification

- [x] 10.1 `snapshot_layout(maxDepth: 0)` confirms all 8 light frames at their canvas positions: `x ∈ {3040, 4560}`, 4 rows at `y ∈ {0, 980, 1960, 2940}`. Dimensions match spec (1440×900 for 7 screens, 1440×1800 for Settings).
- [x] 10.2 `search_all_unique_properties` across all 8 light frame roots. Every `fillColor`/`textColor`/`strokeColor` value is either: (a) a light-mode token resolution, (b) a theme-derived alpha overlay using light-mode accent RGB, or (c) an approved absolute listed in `design.md` (`#00000000`, `#00000099`, `#ffffffcc`, `#3bc9db`, `#4285f444`, `#1a1a2a`, `#262626`, `#a1a1aa`, `#a855f7`, `#ffffff`, `#e8e8e8`, `#525252`, `#7c3aed` for theme-picker preview pixels).
- [x] 10.3 No placeholder flags remain (none were introduced — stubs did not require the placeholder workflow since they were already structurally complete).
- [x] 10.4 `git status` clean scope: only `design/trader.pen` and `openspec/changes/design-desktop-light-mockups/**` touched outside the Pencil-managed file.
- [x] 10.5 `.pen` file is auto-saved by the Pencil MCP server after each `batch_design` / `replace_all_matching_properties` call.
