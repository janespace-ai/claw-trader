# strategy-generation-ui (delta)

## MODIFIED Requirements

### Requirement: AI Prompt Is State-Aware
The strategist persona's system prompt SHALL be assembled per-turn
based on the workspace state (S0/S1a/S1b/S2/S3/S5).  Each state code
maps to a "what to do this turn" guidance section that the prompt
includes verbatim.  See design.md AI Prompt skeleton for the canonical
state→guidance mapping.

#### Scenario: User is at S1a (code only, no symbols)

- **GIVEN** workspace.draft_code is non-null AND draft_symbols is empty
- **WHEN** the user sends a chat message
- **THEN** the system prompt assembled for the LLM SHALL include the
  S1a guidance block which instructs the AI to suggest filter criteria
  and ask "want to filter symbols?".

### Requirement: AI Auto-Names Strategies
The AI SHALL propose a strategy name after approximately 5 user-AI
exchanges in a strategy whose name is still null; the user MAY accept
(becomes strategy.name) or override.

#### Scenario: AI proposes a name on the 5th exchange

- **GIVEN** a strategy with name=null and 4 prior exchanges discussing
  "BTC 1h 均值回归"
- **WHEN** the user sends the 5th message
- **THEN** the AI's next assistant message SHALL include a name
  proposal (e.g., "建议起名: BTC 均值回归 v1") with [接受] / [自定义]
  buttons.
- **AND**  on [接受], the system SHALL set strategy.name to the
  proposal AND not propose again unless the user explicitly clears it.

## REMOVED Requirements

### Requirement: maybeAutoSaveStrategistOutput Heuristic
**Reason**: Replaced by direct draft_* mutation on every accepted AI
turn.  The previous "parse summary + code from message and save"
heuristic only worked for the strategist persona's structured output;
the new flow handles every AI response uniformly via the diff-preview
acceptance flow.
