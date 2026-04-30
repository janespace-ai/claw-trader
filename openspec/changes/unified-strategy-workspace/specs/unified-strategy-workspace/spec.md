# unified-strategy-workspace

## Purpose

The unified-strategy-workspace is the front-door tab where users research a
trading hypothesis with the AI.  It collapses the previously separate
selection / strategy-design / preview-backtest surfaces into one
three-pane workspace (symbols / code+chart+result / chat), and treats the
chat conversation, the strategy code, and the coin universe as three
faces of one entity (the Strategy).

## ADDED Requirements

### Requirement: Three-Pane Workspace Layout

The workspace SHALL render three resizable panes side-by-side:
left=symbol list, center=workspace surface (code / chart / result tabs),
right=AI chat thread.

#### Scenario: Empty session

- **GIVEN** a new strategy with no chat history, no draft_code, no
  draft_symbols
- **WHEN** the page mounts
- **THEN** the left pane SHALL show an empty state with a "AI 帮你筛"
  call-to-action; the center pane SHALL show "尚无策略草稿"; the chat
  pane SHALL show an AI greeting prompting the user to describe a
  strategy idea.

#### Scenario: Both halves present

- **GIVEN** a strategy with non-null draft_code AND non-empty draft_symbols
- **THEN** the workspace SHALL show "运行回测" enabled and "保存策略"
  visible in primary tone.

### Requirement: Single Active Workspace Session

At any moment the workspace SHALL display exactly one Strategy session.
Switching session is permitted via "+ 新建策略" (creates a new strategy)
or via the library tab (loads an existing strategy).

#### Scenario: User clicks "+ 新建策略" while current session is dirty

- **GIVEN** the active strategy has has_workspace_changes=true and
  is_committed=false
- **WHEN** the user clicks "+ 新建策略"
- **THEN** the system SHALL set the current strategy's
  is_archived_draft=true (preserving its chat / draft_*) and
  navigate to a fresh empty session — without prompting for confirmation.

### Requirement: Auto-Backtest On First Complete Pair

The workspace SHALL automatically dispatch a backtest exactly once when
draft_code and draft_symbols both transition from incomplete to complete
within the same session.

#### Scenario: First time both halves complete

- **GIVEN** draft_code was null then becomes "..."
- **AND**  draft_symbols was [] then becomes ["BTC", ...]
- **WHEN** both fields are non-empty for the first time in this session
- **THEN** the system SHALL start a backtest with
  config={ symbols: draft_symbols, ... } and code=draft_code
- **AND**  the workspace SHALL switch the center pane to the result tab.

#### Scenario: Subsequent edit after auto-backtest

- **GIVEN** auto_backtest_done=true and the user edits draft_code via chat
- **THEN** the system SHALL NOT auto-run again; the AI message SHALL
  include a "重新跑回测?" prompt with a button.

### Requirement: Save-Strategy Action Defines saved_*

`保存策略` SHALL be the only operation that mutates saved_code,
saved_symbols, saved_at fields.  Chat-driven edits of draft_* MUST NOT
touch saved_*.

#### Scenario: First save (no name yet)

- **GIVEN** strategy.name is null and saved_at is null
- **WHEN** user clicks "保存策略"
- **THEN** the system SHALL prompt for a name (preset to AI suggestion
  if available)
- **AND**  upon confirm: saved_code=draft_code, saved_symbols=draft_symbols,
  saved_at=now(), name=<entered>.

#### Scenario: Subsequent save (overwrite)

- **GIVEN** saved_at is non-null
- **WHEN** user clicks "保存策略"
- **THEN** the system SHALL overwrite saved_code, saved_symbols,
  saved_at WITHOUT creating a version history record.

### Requirement: Symbols Are Frozen Snapshot

draft_symbols and saved_symbols SHALL be a string[] of symbol identifiers
(e.g., "BTC/USDT").  The system MUST NOT store screener filter rules
alongside the symbol list and MUST NOT auto-recompute symbols based on
market changes.

#### Scenario: Re-opening a strategy 3 months later

- **GIVEN** a strategy saved 3 months ago with symbols=["BTC","ETH","SOL"]
- **WHEN** the user opens the strategy today
- **THEN** the workspace SHALL display the original 3 symbols verbatim
- **AND**  SHALL NOT re-evaluate any rule against current market data.

### Requirement: Status Badge Reflects State

The workspace top bar SHALL display a status badge that indicates one of:
`[草稿]`, `[已保存]`, `[已保存 ●]` (saved with unsaved changes).

#### Scenario: Saved but currently dirty

- **GIVEN** saved_at is non-null AND has_workspace_changes=true
- **THEN** the badge SHALL render "已保存 ●" and the "保存策略" button
  SHALL be in primary highlight tone.
