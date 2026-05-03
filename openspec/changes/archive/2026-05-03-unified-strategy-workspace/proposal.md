## Why

Today the desktop client splits a single user goal — "research a trading
idea" — across three disconnected tabs (选币 / 策略 / 回测).  The
screener's output never reaches the backtest engine; the strategy
designer can only backtest one symbol at a time; chat conversations
have no relationship to the strategies they produced.  New users land
on the 回测 tab with no obvious starting point and no AI-driven
guidance about the next step.

The mental model the user actually has is **"a trading hypothesis I'm
researching with AI"**, where the conversation, the trading code, and
the coin universe are three faces of the same object.  Reflecting that
in the product would dramatically reduce clicks (project north star:
*用户尽量少操作、和 AI 多聊天*), make the AI assistant context-aware
across sessions, and surface drill-down multi-symbol backtest results
that the existing API already supports but the UI never exercised.

## What Changes

- **BREAKING**: Tab restructure.  `选币` (screener) is removed as a
  top-level tab — its functionality lives inside the new front-door tab.
  Final tab order: `创建/编辑策略` (default) │ `策略库` │ existing
  settings.  The legacy 回测 / 策略 tabs collapse into the unified
  workspace.

- **BREAKING**: `Strategy` model gains workspace fields and chat
  history.  Stored shape becomes `{ id, name, chat_messages,
  draft_code, draft_symbols, saved_at, saved_code, saved_symbols,
  last_backtest }`.  Existing `code_type: 'strategy' | 'screener'`
  rows merge — screener code becomes a "filter helper" that produces
  `draft_symbols`, not a standalone entity.

- **NEW**: AI-guided state machine (S0 empty → S1a code-only → S1b
  symbols-only → S2 auto-backtest on first complete pair → S3 save /
  optimize prompt).  System prompt updates per state; AI suggests the
  missing half rather than waiting for the user to figure it out.

- **NEW**: `保存策略` button is the **only** commit point.  Chat
  produces draft_code / draft_symbols continuously; "save" snapshots
  them into saved_*.  No version history (true overwrite per product
  decision).

- **NEW**: First-message implicit strategy creation — user types one
  message and a strategy row is created with `[草稿]` status.  Clicking
  `+ 新建策略` while the current session is unsaved auto-archives the
  current as a draft and opens a fresh session.

- **NEW**: Chat-driven parameter sweep — user types "试 RSI 14, 21, 28"
  in chat, AI parses → backend grid-search → results return inline.
  OptimizeModal becomes an alternative power-user surface, not the
  primary path.

- **NEW**: Coin filter is a **frozen snapshot**, not a re-evaluable
  rule.  When the user says "筛选成交额 top 30" the AI runs the
  screener once and stores the resulting `["BTC", "ETH", ...]` array.
  No "refresh by rule" button; future re-filters are explicit AI asks.

- **NEW**: Multi-symbol backtest results UI — aggregate metrics +
  per-symbol drill-down (existing API already supports
  `BacktestConfig.symbols: string[]` but the UI only ever sent one).

- **REMOVED**: `选币` tab, `screener_runs` UI surface, the standalone
  "code_type === 'screener'" library entries (data-model migration only;
  underlying capability of running a Screener python class on the
  backend is preserved — it's still how `draft_symbols` gets populated).

- **DESIGN-FIRST**: Task 1 (mandatory blocker for all other tasks) is
  re-designing the two screens in `docs/design/trader.pen` (Pencil)
  before any code is written.

## Capabilities

### New Capabilities

- `unified-strategy-workspace`: the new front-door tab — three-pane
  layout (symbols / code+chart / chat), draft-vs-saved state model,
  AI-guided state machine, auto-backtest trigger, save action.
- `strategy-chat-persistence`: client-side SQLite schema + lifecycle
  for strategy.chat_messages (append-only per strategy, code+symbols
  always pinned in LLM context, windowed history with RAG planned
  for v2).
- `multi-symbol-backtest-results`: aggregate + drill-down UI for
  N-symbol backtest output (per-symbol PnL, sharpe, win-rate sortable;
  click a symbol → its kline + signal markers).
- `strategy-library-redesign`: `策略库` tab as a chat-history-style
  conversation list (last activity, last result PnL, draft / saved
  badge).

### Modified Capabilities

- `ui-workspace-strategy-design`: replaced wholesale by
  `unified-strategy-workspace`; strategy-design as a separate concept
  goes away.
- `ui-strategy-management`: strategy library card structure changes
  to chat-history-style; filters by saved/draft status.
- `coin-screening-ui`: removed as a top-level page; its functionality
  becomes "AI tool inside chat" (agent picks symbols and writes them
  to draft_symbols).
- `ui-screener`: removed (page deleted; 选币 tab gone).
- `strategy-api`: strategies API gains `chat_messages_id` reference
  (or analogous), `draft_*` fields, `saved_*` fields.  May get a new
  endpoint for "auto-save current draft as a new strategy" used by
  the `+ 新建策略` flow.
- `backtest-api`: no protocol change but the UI now uses
  `symbols: string[]` with N > 1.  Confirm the screener-execution
  framework actually iterates per symbol and results aggregate
  cleanly (prior change `sandbox-service-and-ai-review` left this
  area lightly tested).
- `ai-conversation`: chat history is now scoped per-strategy rather
  than session-global.  Conversation persistence, the system prompt,
  and the LLM context windowing all change.
- `strategy-generation-ui`: AI-guided state-machine prompts replace
  the persona-only prompt; AI now reasons about "what's the user
  missing?" not just "produce code".
- `ui-workspace-preview-backtest` & `ui-workspace-deep-backtest`:
  preview merges into the unified workspace's auto-backtest result
  surface.  Deep workspace stays for per-run drill-down but is no
  longer the entry — opened from a strategy's "view full report" link.

## Impact

- **Desktop client**: significant.  New screen replacing
  `StrategyDesign.tsx`, `ScreenerScreen.tsx`, AIPanel
  (mostly rewritten), new shared state store
  `strategySessionStore` replacing `workspaceDraftStore` +
  `screenerRunStore`.  Library card redesign.  Tab routing
  rewritten.  Existing tests need significant rework.
- **service-api (Go)**: minor.  `strategies` table schema migration
  (add chat_messages reference, draft / saved fields).  Possibly a
  new endpoint for "save as draft"; existing `code_type` enum
  becomes legacy with screener rows soft-deleted or migrated.
- **sandbox-service**: no change to core; verify multi-symbol
  Strategy execution path actually works end-to-end (was previously
  exercised only single-symbol via UI).
- **Local SQLite (Electron)**: schema additions for chat persistence
  scoped per strategy.  Existing client-side `conversations` table
  is migrated into `strategy_chats` keyed by strategy_id.
- **OpenAPI contract**: Strategy schema gains fields; no breaking
  change to existing endpoints (additive).
- **Designs (`docs/design/trader.pen`)**: two screens fully
  redesigned (mandatory **first task**).
- **i18n**: new strings for guided AI prompts, save dialog,
  draft-state indicators, drill-down result labels.
- **Out of scope (deferred to v2)**: RAG over chat history, named
  conversation branches, cross-strategy chat search, export /
  import strategy as portable file.
