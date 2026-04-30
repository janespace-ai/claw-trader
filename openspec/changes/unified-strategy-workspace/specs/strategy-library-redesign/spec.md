# strategy-library-redesign

## Purpose

The `策略库` tab as a Claude/ChatGPT-style conversation list.  Each
row represents a Strategy (which IS a chat).  Replaces the previous
"strategy code list" that ignored the chat dimension entirely.

## ADDED Requirements

### Requirement: Conversation-Style Cards

Each library row SHALL display:
- Strategy name (or "未命名" + first-user-message snippet for unnamed)
- Last-message preview (1 line, max 80 chars, role-prefixed)
- Last backtest PnL pill (green ≥ 0%, red < 0%, gray if no backtest)
- Symbols count badge (e.g., "11 syms")
- Saved / draft badge ([已保存] / [草稿])
- Updated_at relative time ("2 天前")

#### Scenario: Saved strategy with successful backtest

- **GIVEN** a strategy {name: "BTC 均值回归", saved_at: 2 days ago,
  draft_symbols.length: 11, last_backtest.pnl_pct: 18.3,
  last_chat: "AI: 调到 21 后表现更稳"}
- **THEN** the row SHALL display the name, [已保存] badge, "11 syms"
  count, green pill "+18.3%", "AI: 调到 21 后表现更稳" snippet,
  "2 天前" timestamp.

### Requirement: Sort + Filter

The library SHALL provide sort options: updated_at desc (default),
last PnL desc, name asc.  And filter chips: 全部 / 已保存 / 草稿 /
收藏 / 已归档.

#### Scenario: Switch sort to last PnL desc

- **GIVEN** strategies A (PnL +5%), B (PnL +18%), C (no backtest)
- **WHEN** user picks "last PnL desc"
- **THEN** order SHALL be B, A, C (no-backtest sinks to bottom).

### Requirement: Search By Name (Not Content)

The library SHALL provide a search box that filters by strategy name
substring only.  Full-content search across chat history is explicitly
out of scope (per decision T11).

#### Scenario: Search matches by name only

- **GIVEN** strategies named "RSI Mean Reversion" and "Momentum BTC"
  where "Momentum" never appears in any name but appears in chat
- **WHEN** the user types "Momentum"
- **THEN** only "Momentum BTC" SHALL appear in the filtered list.

### Requirement: Click Loads Full Session

Clicking a row SHALL navigate to tab 1 with the strategy's full chat
history, draft_code, draft_symbols, and last_backtest restored
verbatim.

#### Scenario: Click an archived draft

- **GIVEN** a row with is_archived_draft=true
- **WHEN** clicked
- **THEN** the workspace SHALL load the strategy and present the same
  surface the user was on before they archived it (chat scrolled to
  bottom, center pane on the same tab they last had open if known).

### Requirement: Create-New Action

The library SHALL include a "+ 创建新策略" button which navigates to
tab 1 with a fresh empty workspace (new strategy id created on first
chat message, per the strategy-chat-persistence requirement).

#### Scenario: User clicks create-new

- **GIVEN** the library page is mounted
- **WHEN** user clicks "+ 创建新策略"
- **THEN** the app SHALL navigate to tab 1 AND the workspace SHALL
  render the empty state (no strategy id assigned until first message).
