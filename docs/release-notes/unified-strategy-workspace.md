# Release: unified-strategy-workspace

## TL;DR

The desktop client is reframed around a single chat-driven workspace.
Three tabs become two; one screener becomes embedded; backtests run
automatically; AI mutations land as accept-or-reject diff cards.

## What's new

### A single front door — 创建/编辑策略

- Replaces the old 选币 / 策略 / 回测 trio with one three-pane workspace.
- Left rail: the strategy's symbol universe.
- Center: tabs for code / chart / result.
- Right: AI chat thread that drives the whole flow.

### A real chat-driven AI strategist

- Talk to the AI in plain language — "想做个 BTC 均值回归" → strategy
  code lands as a diff-preview card.  Click 应用 to commit, or 拒绝
  to discard.
- "筛 24h 成交额 top 30" → AI runs a real screener Python program;
  passing symbols write into the workspace's symbol list.
- "试 RSI 14, 21, 28" → workspace dispatches a parameter sweep,
  identifies the winner, and writes it back.
- The AI sees your live workspace state (draft_code + draft_symbols)
  on every turn — no more "AI hallucinates a backtest result".

### Backtests fire automatically

- The instant both halves of the workspace (code + symbols) become
  present for the first time, a backtest runs in the background.
- Result tab auto-activates with aggregate metrics + a sortable
  per-symbol drill-down.  Outcome filter chips (盈利 / 亏损) for
  fast triage.
- Re-runs are explicit (action bar 重新跑回测 button).

### Strategy library — Claude/ChatGPT-style

- 策略库 tab: each row is a chat session, complete with name + last
  message snippet + PnL pill + symbol count + draft/saved badge +
  relative time.
- Click a row → workspace re-hydrates with full chat history + draft
  + saved snapshots.

### Save = the only commit point

- chat-driven edits accumulate as a *draft* zone on the strategy.
- Click 保存策略 to snapshot draft → saved.  No version history;
  this is true overwrite per design.
- Re-saves go through silently.  First save opens a name dialog with
  an AI-suggested name pre-filled.

### Auto-archive of dirty drafts

- Click "+ 创建新策略" while you have unsaved changes → the previous
  session is automatically archived (recoverable in the library
  under 归档草稿).  No data loss.

## Engineering changes worth knowing

- New OpenAPI endpoints: `PATCH /api/strategies/{id}`,
  `POST /api/strategies/{id}/save`, `POST /api/strategies/{id}/archive_draft`.
  Strategy schema gains 7 new fields.  See migration guide for SQL.
- New client SQLite table `strategy_chats` (append-only chat history
  per strategy).  Migration runs once on first launch.
- New zustand store `strategySessionStore` — single source of truth
  for the active workspace session, replaces 4 deleted stores.
- Pencil designs at `docs/design/trader.pen`; hand-off doc at
  `docs/design/unified-strategy-workspace-frames.md`.

## Breaking changes (early users only)

This is a v1; we deleted instead of deprecated.  The 选币 tab,
old 策略管理 grid, old strategy-design workspace, old preview-
backtest workspace, old auto-save heuristics — all gone.  See
[migration-strategy-workspace.md](./migration-strategy-workspace.md)
for the full list and how to verify a clean upgrade.

## Roadmap (not in this release)

- **RAG over chat history** — currently we slide-window the last 30
  messages into context.  When a strategy crosses ~50 turns and the
  AI starts losing the plot, ship retrieval.
- **Cross-strategy chat search** — name search only today; full-text
  search across messages is out of scope.
- **Strategy fork / branch** — for now use 复制策略 + edit.  If 2+
  users ask for branching, ship it.
- **Web app variant** — defer until product demand exists.  T11
  ("client-side SQLite") makes a Web variant non-trivial.

## Verification

- `pnpm tsc --noEmit` — clean
- `pnpm vitest run` — 266/266 passing
- `pnpm api:lint` — 28 examples, 0 errors
- `go test ./...` — clean (service-api side)
- Pencil canvas: 11 master frames, all light variants resolved via CSS
  flip at runtime.
