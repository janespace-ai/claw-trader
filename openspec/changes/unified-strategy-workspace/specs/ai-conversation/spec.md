# ai-conversation (delta)

## MODIFIED Requirements

### Requirement: Conversation Scope Becomes Per-Strategy
A conversation SHALL belong to exactly one Strategy.  The legacy
session-global conversation list (`window.claw.db.conversations.list`)
becomes a read-only "Legacy" view; new chats always belong to a
strategy id.

#### Scenario: New chat without strategy id is rejected

- **GIVEN** the chat layer is initialized
- **WHEN** any code path attempts to write a chat message without a
  parent strategy_id
- **THEN** the write SHALL fail at the persistence layer.

### Requirement: Conversation Persistence Layer
Chat messages SHALL persist to a new `strategy_chats` table in the
client-side SQLite, keyed on (strategy_id, msg_idx) for ordering.
The legacy `conversations` table is migrated row-by-row (see
`strategy-chat-persistence` capability).

#### Scenario: Insert a new message

- **GIVEN** a strategy with 3 existing chat_messages (msg_idx=0,1,2)
- **WHEN** the client appends a new user message
- **THEN** the new row SHALL be persisted with msg_idx=3 and primary
  key (strategy_id, 3).

### Requirement: System Prompt Includes Workspace State
The system prompt for each LLM request SHALL include a structured
`<workspace_state>` block carrying the strategy's current draft_code,
draft_symbols, and a state code (S0/S1a/S1b/S2/S3/S5).  The prompt
SHALL NOT be truncated when chat history is windowed — workspace
state is mandatory context.

#### Scenario: Long history but workspace state still pinned

- **GIVEN** a strategy with 200 messages (history windowed to last 30)
- **WHEN** a new chat request is built
- **THEN** the system prompt SHALL contain the full draft_code (any
  length up to model max) AND full draft_symbols array
- **AND**  the windowed 30-message history SHALL be appended after.

## ADDED Requirements

### Requirement: Sliding-Window History (v1)
The LLM context SHALL include the most recent 30 chat messages by
default.  Strategies whose history exceeds 30 messages SHALL still
function correctly: older messages are dropped from the prompt but
not deleted from storage.  RAG-based selective retrieval is deferred
to v2.

#### Scenario: Strategy with 50 messages

- **GIVEN** a strategy whose chat_messages count is 50
- **WHEN** building the LLM request for the 51st turn
- **THEN** the messages array SHALL include exactly 30 (messages
  21..50)
- **AND**  all 50 SHALL remain in client-side SQLite untouched.

### Requirement: One Mutation Per AI Turn
Each AI assistant message SHALL produce at most one mutation to the
workspace (either draft_code OR draft_symbols, not both).  Mutations
require the user to explicitly accept via a diff preview before
draft_* is updated.

#### Scenario: AI proposes a code change

- **WHEN** the AI emits a ` ```python ... ``` ` block
- **THEN** the client SHALL render a diff preview against the current
  draft_code with `[应用]` and `[拒绝]` buttons
- **AND**  draft_code SHALL update only after the user clicks `[应用]`.
