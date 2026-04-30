# coin-screening-ui (delta)

## REMOVED Requirements

### Requirement: Standalone Screener Page (`选币` tab)
**Reason**: The coin-screening function is no longer a top-level page.
Filtering happens inside the unified-strategy-workspace via AI chat:
the user describes a filter, the AI runs a Screener Python program in
the sandbox, and the resulting symbol list is written into the active
strategy's draft_symbols.  The dedicated screener page, its run button,
its saved-lists overlay, and its passing-list left-rail UI are
deleted.
**Migration**: Existing `screener_runs` rows remain in the database
for historical inspection but no UI surfaces them.  Existing saved
coin lists (`coin_lists` table) become read-only — no new entries are
created from the new flow; old entries can be re-imported by asking
the AI "use coin list <name>" (out of scope for v1).

### Requirement: Screener Saved-Lists Overlay
**Reason**: Removed with the page.

### Requirement: Manual `运行选币` Button
**Reason**: AI initiates the run; no manual surface needed.

## ADDED Requirements

### Requirement: AI-Initiated Symbol Filtering Inside Workspace

The unified-strategy-workspace's AI assistant SHALL be able to
synthesize and execute a Screener Python program when the user
describes filter criteria in chat (e.g., "筛 24h 成交额 top 30").

#### Scenario: User asks for a filter

- **GIVEN** the workspace is open and the AI is in any state
- **WHEN** the user sends "筛 24h 成交额 top 30"
- **THEN** the AI SHALL emit a Screener code block, dispatch it to
  sandbox-service via `POST /api/screener/start`, poll for completion,
  and on success write the resulting passing-symbols array into the
  strategy's draft_symbols.
- **AND**  the chat SHALL surface a brief inline status ("✓ 筛出 11
  个，已写入") rather than navigating away.
