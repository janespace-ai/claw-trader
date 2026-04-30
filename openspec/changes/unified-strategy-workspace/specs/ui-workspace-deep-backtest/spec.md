# ui-workspace-deep-backtest (delta)

## MODIFIED Requirements

### Requirement: Deep Backtest Becomes Drill-Down Surface
The deep-backtest UI SHALL no longer be the primary "run a full
backtest" entry — that role MUST be taken by the unified workspace's
auto-backtest.  Deep backtest SHALL remain available as a "view full
report" link opened from a strategy's result surface, presenting
per-trade detail, parameter optimization launcher (OptimizeModal), and
improvement suggestions.

#### Scenario: User opens deep view from a result

- **GIVEN** a strategy with last_backtest populated
- **WHEN** the user clicks "查看完整报告" in the result tab
- **THEN** the workspace SHALL open the deep-backtest surface scoped
  to that backtest task_id, retaining the strategy context (chat
  history visible in right pane).

## ADDED Requirements

### Requirement: Param Sweep Entry Via Chat
The unified workspace SHALL accept parameter-sweep requests via chat
("试 RSI 14, 21, 28") in addition to the OptimizeModal manual surface.
The AI parses the request, validates the parameter axes against the
strategy's params_schema, and dispatches a backtest with mode='optimization'
to the existing endpoint.  Results return in the chat with a link to
the deep-backtest surface for full inspection.

#### Scenario: User asks for a 3-value RSI sweep

- **GIVEN** a saved strategy with params_schema containing rsi_period
- **WHEN** the user sends "试 RSI 14, 21, 28"
- **THEN** the AI SHALL dispatch a backtest with mode='optimization'
  and grid={ rsi_period: [14, 21, 28] }
- **AND**  return a chat message embedding a 3-row summary table plus
  a "查看完整报告" link to the deep-backtest screen for the winning run.
