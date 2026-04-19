## Context

`design/trader.pen` uses `lightweight-charts`-compatible candle + overlay rendering across 6/8 screens, plus a reusable symbol-row primitive, a strategy-card primitive, and a right-side AI panel that varies its persona per screen. Trying to build each screen from scratch would reinvent the same parts 8 times; building them once here makes the per-screen changes tractable (1.5-2 weeks each instead of 4+).

Constraints:
- **lightweight-charts v4** is already in deps but barely used. Its API is imperative (`chart.addCandlestickSeries()`, `series.setData(...)`); it doesn't compose naturally with React. We need a thin React wrapper.
- **Electron + Playwright**: visual regression tests have to launch the real app (or a Vite dev server with MSW). Playwright can drive Electron directly; that's the target.
- **Theme switching**: CSS variables change live. Charts don't auto-redraw on var changes — we need to wire `MutationObserver` on `<html data-theme>` or pass theme through React context.
- **Pixel fidelity** means spacing / font / radius have to match Pencil, not just colors. Existing Tailwind config already aligns colors but not the rest.

## Goals / Non-Goals

**Goals:**
- Ship 5 composable primitives (`ClawChart.*`, `Watchlist`, `WorkspaceShell`, `AIPersonaShell`, `MetricsGrid`) that subsequent screen changes assemble.
- Establish the navigation state machine so Workspace → Preview → Deep transitions work without URL plumbing.
- Commit a working Playwright visual regression harness with a blank-shell snapshot baseline.
- Align `tailwind.config.js` with Pencil's full token set — spacing, radius, font — not just colors.
- Refactor `App.tsx` routing without breaking existing screens.

**Non-Goals:**
- Implement any Pencil screen in this change. Placeholder renders are fine.
- Implement any AI persona's prompt / wiring. The `AIPersonaShell` is a container; the prompts ship with each screen.
- Implement indicator computation (RSI/MACD/BB). Each screen's change adds the indicators it needs.
- Real-time updates. All charts are static snapshots of historical data from MSW.
- Storybook. Visual regression + manual preview covers component verification.

## Decisions

### D1. `ClawChart` as imperative-inside, declarative-outside wrapper

**Decision.** Each `ClawChart.*` is a React component that:
- Takes props `{ data, overlays?, markers?, height, width? }`.
- Creates a `lightweight-charts` instance on mount via `useRef` + `useEffect`.
- Calls `series.setData(...)` when `data` prop changes (reference identity check; expect memoized arrays).
- Listens to `window` resize + `ResizeObserver` on its container.
- Listens to theme change (CSS `data-theme` mutation) to redraw with the right colors.
- Cleans up on unmount.

Internal instance is never exposed as a prop or via `forwardRef` — containers interact via declarative prop changes.

**Alternatives considered.**
- **Thin ref exposing `IChartApi`** — leaks the library; future chart-lib swaps become breaking changes.
- **Re-render whole chart on every data change** — lightweight-charts is imperative for good reason (60fps tick updates). `setData` + `update` is the right primitive.
- **Use `react-financial-charts` or `recharts`** — both lack the candlestick + multi-pane + crosshair feature set Pencil requires.

### D2. Workspace state machine in a dedicated store, not URL

**Decision.** `workspaceStore` holds `{ mode: "design" | "preview" | "deep", currentStrategyId, currentTaskId, focusedSymbol }`. Transitions are store actions (`enterPreview(strategyId)`, `enterDeep(taskId)`, `back()`). Not in URL.

**Alternatives considered.**
- **URL params** (`#/workspace/preview?taskId=...`) — would require hash routing inside Electron; breaks deep-link copy-paste (which isn't a use case anyway for a desktop app); more surface for bugs.
- **Single `currentMode` on appStore** — conflates workspace state with top-level tab state. Separation clarifies.

### D3. Playwright for visual regression, snapshots in git

**Decision.** `@playwright/test` with Chromium only. Snapshots committed under `desktop-client/e2e/visual/__screenshots__/<spec>/<platform>/<name>.png`. Diff tool: Playwright's built-in `expect(page).toHaveScreenshot(...)`.

Platform filter: Chromium-only, headless, fixed viewport `1440×900` (match Pencil frame size). One snapshot per screen per theme. No cross-OS snapshots — too much maintenance.

**Alternatives considered.**
- **Chromatic** — requires an account + paid for frequent CI runs. Can revisit later.
- **Percy** — same concern.
- **Pencil MCP screenshot** (taking shots of the `.pen` file) — wrong direction; want shots of the actual DOM.
- **No visual regression** — pixel-level is one of the user's stated requirements; without testing, drift is inevitable.

**Consequence.** Snapshot reviewing is manual during PRs — reviewer inspects the PNG diff. Acceptable with discipline; formalize later if noise becomes a problem.

### D4. Playwright drives the renderer, not Electron main

**Decision.** Tests launch the **Vite dev server with MSW enabled** and point Playwright's Chromium at `http://localhost:5173` directly. NOT launching Electron during visual regression.

Why: Electron main-process boot adds 2-3 seconds per test start + native dependencies that complicate CI. The renderer's visual layer is identical between dev server and Electron, so testing the dev server covers visual correctness. IPC-bridged data is mocked via MSW either way.

**Consequence.** Visual tests won't catch Electron-specific layout issues (e.g. title bar interactions). Those need separate integration tests, not visual regression.

### D5. Token alignment: spacing scale reworked, not just extended

**Decision.** Replace Tailwind's default spacing scale entirely with Pencil's: `{ 0: '0', px: '1px', 0.5: '2px', 1: '4px', 1.5: '6px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px' }`. Values beyond 16 (e.g. `gap-20` = 80px) are allowed but flagged by an ESLint rule.

**Radius scale** aligned: `rounded-sm|md|lg|xl|full` = `6 / 8 / 12 / 16 / 9999`.

**Font:** index.html preloads Geist + Geist Mono. Inter already loaded.

**Alternatives considered.**
- **Keep Tailwind's default scale + add Pencil values as extensions** — ambiguous ("is `space-3` Tailwind's 12 or Pencil's 16?"). Explicit replacement resolves.
- **Use design tokens directly via CSS custom properties** — Tailwind's utility classes are more ergonomic and what the codebase uses today.

**Consequence.** Existing components using off-scale values (`p-7`, `gap-9`) break silently — they render correctly (Tailwind computes `1.75rem` etc.) but the value isn't in our scale. Audit + fix during implementation.

### D6. `AIPersonaShell` with slot-based per-persona wiring

**Decision.** Single shell component exposing:

```
<AIPersonaShell persona="signal-review" context={{ backtestTaskId }}>
  <AIPersonaShell.Intro />          ← renders persona-specific greeting
  <AIPersonaShell.Transcript />     ← message list (auto-run status, structured outputs)
  <AIPersonaShell.Composer />       ← input + send, hidden for read-only personas (Trade Analysis)
</AIPersonaShell>
```

Each persona maps to:
- System prompt (in `desktop-client/src/services/prompt/personas/<name>.ts`, created later per-screen)
- Intro message content
- Expected output parser (for structured outputs like OptimLens improvements)
- Whether composer is shown (Strategist=yes, SignalReview=yes, OptimLens=yes, TradeAnalysis=no, Screener=yes)

This change ships the **shell** with `strategist` persona stub-wired (reuses current generic prompt). Other personas are wired in their respective screen changes.

**Alternatives considered.**
- **One component per persona** — five independent chat UIs diverge over time.
- **Current generic AIPanel with promptMode** — what we have; doesn't accommodate structured outputs (OptimLens cards, Signal Review verdicts).

### D7. Navigation replaces `currentTab` with `AppRoute` discriminated union

**Decision.** `useAppStore().route: AppRoute`. The top-level `App.tsx` renders by `route.kind`. Workspace sub-mode comes from `workspaceStore.mode`, not `route`.

```
type AppRoute =
  | { kind: "screener" }
  | { kind: "strategies" }
  | { kind: "workspace"; strategyId?: string }      // sub-mode from workspaceStore
  | { kind: "symbol-detail"; symbol: string; returnTo: AppRoute }
  | { kind: "settings"; section?: string }
```

Migration path: `appStore.currentTab` stays as an aliasing getter during the transition so existing code doesn't break. Each screen change deletes the alias usage as it migrates.

### D8. Watchlist: controlled component, no internal data fetching

**Decision.** `<Watchlist items={[...]} focused={symbol} onFocus={...} />`. Parent fetches via `cremote.listSymbols` or by slicing a backtest result. Watchlist only renders.

**Consequence.** Keeps primitive reusable across screens that source data differently (screener result vs. backtest per-symbol vs. strategy card's target symbols).

### D9. MetricsGrid: data-driven layout

**Decision.** `<MetricsGrid metrics={[{ label, value, unit?, delta? }, ...]} columns="auto" />`. Columns auto-pack based on `clamp(minmax(...))` grid-template-columns. Items have optional `emphasis: "large"` for headline stats (Total Return, Sharpe) vs. smaller tiles.

Component has zero knowledge of what specific metric is — screens pass the right bundle. Design-aligned tiles have: label(12px muted) + value(24px data-font) + delta(10px color-coded).

## Risks / Trade-offs

- **[lightweight-charts theme switching is not built-in]** → Wrap in an effect that reads CSS vars on mount + on `<html data-theme>` mutation, calls `chart.applyOptions({ layout: { background, textColor }, grid: {...} })`. Tested in D1.

- **[Playwright in Electron apps has known subtleties]** → We're side-stepping by driving the Vite dev server directly (D4). If that proves insufficient, fallback is Playwright's Electron-specific API; documented in tasks.

- **[Snapshot flakiness from fonts / anti-aliasing]** → Mitigation: pin exact Geist/Inter font files in `public/fonts/`, set `playwright.config.ts` to `threshold: 0.2` (allow ≤ 20% pixel diff per region) — still catches real regressions, tolerates sub-pixel jitter.

- **[Spacing scale change breaks existing screens]** → Most off-scale uses are small (`p-5`, `gap-6`) which remain on-scale. True offenders are rare; audited manually in task group 6. Existing screens should still render; visual regression baseline will catch unintended shifts.

- **[Visual regression baseline is empty/blank this change]** → Only the `WorkspaceShell` blank-state + an `AIPersonaShell` empty state get snapshots. Per-screen snapshots are each screen's responsibility. This is fine; foundation change's baseline is about proving the harness works.

- **[`ClawChart` API will evolve as each screen asks for new overlays]** → Accepted. The API exposed by this change is a starting contract; screens may widen props (add `volume`, `secondary_series`, etc.). We'll refactor as we go.

## Migration Plan

1. Land primitives (no screen touches them yet).
2. Land navigation state machine + `AppRoute` type + `App.tsx` refactor (existing pages adapted to the new `route.kind` switch, behavior unchanged).
3. Land token alignment (expect minor pixel shifts in existing pages — reviewable in visual regression baseline).
4. Land Playwright harness + blank-shell snapshots.
5. Each subsequent screen change consumes primitives.

Rollback is commit revert. No data model changes.

## Open Questions

- Do we want `ClawChart.Candles` to support a volume pane under the main pane? Design shows it on Preview and Deep. Answer: yes, as a `showVolume?: boolean` prop; implemented in this change as a stub that hides when false, draws when true.
- Should `AIPersonaShell` own its own zustand slice per persona, or reuse the existing `conversationStore`? Answer: reuse for now (single conversation state); formalize per-persona slices if we need divergent history per persona.
- Should the visual regression baseline capture the AI panel's collapsed state too? Probably. Two shell snapshots per theme (expanded AI + collapsed AI), not one.
- Token change might cascade. Commit individually so reviewer can spot the intentional shift.
