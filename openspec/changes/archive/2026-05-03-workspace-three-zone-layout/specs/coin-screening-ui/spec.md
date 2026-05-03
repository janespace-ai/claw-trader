# coin-screening-ui (delta)

## REMOVED Requirements

### Requirement: AI-Initiated Symbol Filtering Inside Workspace
**Reason**: The previous behaviour wrote filter results directly into
`draft_symbols`, which made it impossible for the user to review or
cherry-pick the result.  Replaced by a two-step flow: AI populates a
new `lastFilteredSymbols` field, the user reviews in the "选出的币"
tab and explicitly adds rows to `draft_symbols`.
**Migration**: No data migration.  The `screenerStart` IPC payload is
unchanged; only the on-success handler routes the result to a
different in-memory store field.

## ADDED Requirements

### Requirement: AI Filter Result Lands in lastFilteredSymbols

The AI SHALL write completed-screener results into the strategy session's `lastFilteredSymbols` field (shape: `{ symbols: string[]; runAt: number; criteria: string }`) and MUST NOT mutate `draft_symbols`.  When the user describes a filter in chat (e.g. "筛 24h 成交额 top 30"), the AI synthesizes and runs a Screener Python program via `POST /api/screener/start`, then on completion populates the field above.

#### Scenario: AI runs a filter

- **GIVEN** workspace is open with `draft_symbols=["BTC_USDT"]`
- **WHEN** the user sends "筛 24h 成交额 top 30" and the screener
  completes returning 30 symbols
- **THEN** `lastFilteredSymbols.symbols` SHALL equal those 30 symbols
- **AND**  `lastFilteredSymbols.runAt` SHALL be set to `Date.now()`
- **AND**  `lastFilteredSymbols.criteria` SHALL be a short string
  describing the filter (e.g. `"24h 成交额 top 30"`)
- **AND**  `draft_symbols` SHALL still equal `["BTC_USDT"]`.

### Requirement: Filtered Tab Cherry-Pick Surface

The "选出的币" tab in the BOTTOM zone SHALL display:
- An **upper section** "草稿 (N)" — chip list of `draft_symbols` with
  per-chip "×" to remove.
- A **lower section** "上次 AI 筛出 (M)" — table of
  `lastFilteredSymbols.symbols` showing symbol / 24h vol / 24h % /
  market cap / "+ 加入" button.  The table header SHALL include a
  "+ 全部加入草稿" action that adds every filtered symbol not already
  in `draft_symbols`.

#### Scenario: User clicks "+ 加入" on a filtered row

- **GIVEN** `draft_symbols=["BTC_USDT"]` and
  `lastFilteredSymbols.symbols=["BTC_USDT","ETH_USDT","SOL_USDT"]`
- **WHEN** the user clicks "+ 加入" on the ETH_USDT row
- **THEN** `draft_symbols` SHALL become `["BTC_USDT","ETH_USDT"]`
- **AND**  `lastFilteredSymbols` SHALL be unchanged
- **AND**  the ETH_USDT row's button SHALL flip to "✓ 已加入" disabled.

#### Scenario: User clicks "+ 全部加入草稿"

- **GIVEN** `draft_symbols=["BTC_USDT"]` and
  `lastFilteredSymbols.symbols=["BTC_USDT","ETH_USDT","SOL_USDT"]`
- **WHEN** the user clicks "+ 全部加入草稿"
- **THEN** `draft_symbols` SHALL become
  `["BTC_USDT","ETH_USDT","SOL_USDT"]` (deduped, BTC not duplicated).

#### Scenario: User removes a draft chip

- **GIVEN** `draft_symbols=["BTC_USDT","ETH_USDT"]`
- **WHEN** the user clicks "×" on the BTC chip
- **THEN** `draft_symbols` SHALL become `["ETH_USDT"]`
- **AND**  if `focusedSymbol === "BTC_USDT"`, `focusedSymbol` SHALL
  remain `"BTC_USDT"` (chip removal does NOT change focus).

### Requirement: Inline Chat Status Reflects Filter Outcome

When an AI-driven screener completes, the chat SHALL surface a brief
status bubble such as "✓ 筛出 30 个，详情见中下「选出的币」页签 →"
(or red-toned "✗ 筛选失败: <reason>" on error).  The chat MUST NOT
embed the full symbol list — that lives in the BOTTOM tab.

#### Scenario: Filter succeeds

- **WHEN** the AI's screener returns 30 symbols
- **THEN** an assistant chat message SHALL be appended with text
  matching `/✓ 筛出 \d+ 个/` and a hint pointing to the "选出的币" tab.

#### Scenario: Filter fails

- **WHEN** the AI's screener errors (sandbox failure, code review
  reject, etc.)
- **THEN** an assistant chat message SHALL be appended starting with
  `✗`
- **AND**  `lastFilteredSymbols` SHALL be left at its prior value (NOT
  cleared).
