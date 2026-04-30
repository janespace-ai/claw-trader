# strategy-api (delta)

## ADDED Requirements

### Requirement: Strategy Schema Includes Workspace + Saved Fields

The Strategy resource SHALL include the following fields in addition
to existing identity fields:

- `draft_code: string | null` — latest from chat, mutable
- `draft_symbols: string[] | null` — latest from chat, mutable
- `saved_code: string | null` — last committed snapshot
- `saved_symbols: string[] | null` — last committed snapshot
- `saved_at: integer (unix seconds) | null` — null if never saved
- `last_backtest: { task_id, summary, ran_at } | null`
- `is_archived_draft: boolean` — true when user pressed "+ 新建" on
  this session without ever saving it

#### Scenario: GET /api/strategies/:id returns full envelope

- **GIVEN** a saved strategy in the database
- **WHEN** the client GETs the strategy by id
- **THEN** the response body SHALL include all of: id, name,
  draft_code, draft_symbols, saved_code, saved_symbols, saved_at,
  last_backtest, is_archived_draft, created_at, updated_at.

### Requirement: PATCH Endpoint For Draft Mutation

The API SHALL support a PATCH endpoint that mutates draft_code,
draft_symbols, and last_backtest on an existing strategy without
touching saved_*.  Example: `PATCH /api/strategies/{id}` with body
`{ draft_code?, draft_symbols?, last_backtest? }`.

#### Scenario: PATCH does not touch saved_*

- **GIVEN** strategy { saved_code: "v1 code", draft_code: "v1 code" }
- **WHEN** the client PATCHes with `{ draft_code: "v2 code" }`
- **THEN** the row SHALL become `{ saved_code: "v1 code",
  draft_code: "v2 code" }` (saved_code unchanged).

### Requirement: POST /save Endpoint Snapshots Draft → Saved

The API SHALL support `POST /api/strategies/{id}/save` which atomically
copies draft_code → saved_code, draft_symbols → saved_symbols, and
sets saved_at = now().

#### Scenario: First save (no name)

- **GIVEN** strategy.name is null
- **WHEN** the client POSTs to /save with `{ name: "..." }`
- **THEN** the server SHALL set the name as well as the saved_* fields,
  in a single transaction.

### Requirement: Auto-Archive Endpoint For Dirty Sessions

The API SHALL support `POST /api/strategies/{id}/archive_draft` which
sets is_archived_draft=true.  Used by the desktop client when the user
clicks "+ 新建策略" while the active session is dirty.

#### Scenario: Archive a dirty unsaved strategy

- **GIVEN** a strategy with saved_at=null, draft_code="...", and
  is_archived_draft=false
- **WHEN** the client POSTs `/api/strategies/{id}/archive_draft`
- **THEN** the row SHALL update with is_archived_draft=true; all
  other fields SHALL remain unchanged.

## MODIFIED Requirements

### Requirement: code_type Field Becomes Legacy
The `code_type` field SHALL NOT be set on new strategies created
through the unified workspace; it remains in the schema for backwards
compatibility with archived rows.  All new rows MUST be conceptually-
merged Strategies (containing both screener and trading-strategy code).

#### Scenario: New strategy creation via unified workspace

- **WHEN** the client POSTs to `/api/strategies` from the new
  unified-strategy-workspace flow
- **THEN** the server SHALL persist the row with code_type=null
  (or omit the field entirely)
- **AND**  any client request that sets code_type SHALL be rejected
  with a 400.
