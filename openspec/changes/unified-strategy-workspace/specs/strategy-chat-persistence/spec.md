# strategy-chat-persistence

## Purpose

Each Strategy owns its chat history.  Chat messages persist locally
(client-side SQLite) so re-opening a strategy restores the full
conversation including past AI suggestions, code diffs, and decisions.
This capability defines the data shape, lifecycle, and LLM context
selection rules for that history.

## ADDED Requirements

### Requirement: Per-Strategy Chat Scope

Every chat message SHALL belong to exactly one Strategy via
strategy_id.  The system MUST NOT permit messages without a parent
strategy.

#### Scenario: First user message on empty workspace

- **GIVEN** the workspace is empty (no strategy_id in scope)
- **WHEN** user sends the first chat message
- **THEN** the system SHALL create a strategy row first, obtain its id,
  and write the message with strategy_id set to that id — atomically.

### Requirement: Append-Only Chat History

Once written, a chat message MUST NOT be edited or deleted from the
persistent store.  Corrections SHALL appear as new messages.

#### Scenario: Attempt to delete a message

- **GIVEN** a strategy with 3 chat messages persisted
- **WHEN** any code path attempts to mutate or remove an existing row
- **THEN** the SQLite layer SHALL reject the operation (no UPDATE /
  DELETE statements are exposed; only INSERT).

### Requirement: LLM Context Always Pins draft_code + draft_symbols

When constructing the LLM prompt, the system SHALL always include the
strategy's current draft_code and draft_symbols (or stated absence of
them) in a system-message section, regardless of how long the chat
history is or how the windowing strategy is configured.

#### Scenario: Long chat with windowing

- **GIVEN** a strategy with 100 messages and a 30-message window cap
- **WHEN** preparing the LLM request
- **THEN** the prompt SHALL include the most recent 30 messages
- **AND**  also include a `<workspace_state>` system block with full
  draft_code and draft_symbols arrays.

### Requirement: Chat Survives App Restart

Chat history persisted before app exit SHALL be available verbatim on
next launch when the same strategy is re-opened.

#### Scenario: User restarts the app and reopens a strategy

- **GIVEN** a strategy with 12 chat messages, app closed cleanly
- **WHEN** the user re-launches the app and clicks the strategy in
  the library
- **THEN** the workspace SHALL display all 12 messages in original
  order with original timestamps.

### Requirement: Migration From Legacy `conversations` Table

On first launch after this change ships, the client SHALL migrate
existing `conversations` rows that map 1:1 to a saved strategy into the
new `strategy_chats` schema, preserving message order and timestamps.
Orphan conversations (no associated strategy) SHALL remain readable
under a "Legacy conversations" view for one release cycle.

#### Scenario: First launch after upgrade with mixed conversation set

- **GIVEN** an existing user with 5 conversations (3 mapped to saved
  strategies, 2 orphan) before the upgrade
- **WHEN** the new client version starts for the first time
- **THEN** the migration SHALL create 3 sets of strategy_chats rows
  (one per mapped strategy) preserving message order and ts
- **AND**  the 2 orphan conversations SHALL stay in the legacy
  `conversations` table, accessible via a "Legacy" view in the library.
