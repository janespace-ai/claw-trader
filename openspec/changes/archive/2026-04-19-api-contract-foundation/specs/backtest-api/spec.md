## ADDED Requirements

### Requirement: 回测 API 纳入 OpenAPI 契约

`backtest-api` 能力涉及的所有 endpoint(`POST /api/backtest/start`、`GET /api/backtest/status/{task_id}`、`GET /api/backtest/result/{task_id}`、`GET /api/backtest/history`) SHALL 在 `api/openapi.yaml` 中有对应的 operation 定义,并 SHALL 在 `api/examples/` 下提供至少一个真实 request + response 示例。

#### Scenario: 契约文件覆盖所有回测 endpoint

- **WHEN** 检查 `api/openapi.yaml`
- **THEN** 能找到 `operationId: startBacktest`、`getBacktestStatus`、`getBacktestResult`、`listBacktestHistory` 各一个
- **THEN** 每个都有对应的 `api/examples/<operationId>.json`

### Requirement: 回测任务响应使用 canonical TaskResponse

`GET /api/backtest/status/{task_id}` 和 `GET /api/backtest/result/{task_id}` 在契约中 SHALL 返回 `TaskResponse`(见 `api-contract` 能力)的 shape,`result` 字段由回测领域特定 schema narrow(equity curve、metrics、trades、per-symbol 拆分)。

当前后端实现可能尚未完全对齐该 shape;本 change 仅冻结**契约目标**,实际后端对齐由后续 `backtest-engine-align-contract` change 负责。前端通过 `cremote` 的 adapter 层过渡。

#### Scenario: 契约中 status endpoint 返回 canonical shape

- **WHEN** 查看 `api/openapi.yaml` 中 `getBacktestStatus` 的 response schema
- **THEN** 它 `allOf: [$ref: "#/components/schemas/TaskResponse"]`
- **THEN** 不同于当前后端返回的扁平 shape;`design.md` 记录该差异

### Requirement: 回测配置时间字段使用 Unix 秒

契约中 `BacktestConfig.from` 和 `BacktestConfig.to` SHALL 声明为 `integer`(Unix 秒)。`YYYY-MM-DD` 或 ISO 字符串形态被契约视为 deprecated 输入;后端可能仍接受但不保证未来版本持续支持。

#### Scenario: 契约仅声明 integer 形态

- **WHEN** 查看 `BacktestConfig` schema
- **THEN** `from` 与 `to` 字段类型为 `integer`,描述为 "unix seconds"

### Requirement: 回测错误使用受控 ErrorCode

当 `POST /api/backtest/start` 因合规失败、非法参数、上游不可达等原因返回非 2xx 时,契约 SHALL 将 response body 声明为 `ErrorResponse`(见 `api-contract` 能力),`code` 取自 `ErrorCode` enum。

典型映射:
- 代码合规失败 → `COMPLIANCE_FAILED`(`details.violations: [...]`)
- 沙箱超时 → `SANDBOX_TIMEOUT`
- 沙箱内部异常 → `SANDBOX_ERROR`(`details.logs: [...]`)
- 非法 symbol / interval / range → `INVALID_SYMBOL` / `INVALID_INTERVAL` / `INVALID_RANGE`
- 未找到 task → `BACKTEST_NOT_FOUND` 或 `TASK_NOT_FOUND`

#### Scenario: 合规失败返回结构化错误

- **WHEN** 用户提交的 Python 代码中有 `import os`
- **THEN** 契约 response 形态为 `{ "error": { "code": "COMPLIANCE_FAILED", "message": "...", "details": { "violations": ["forbidden import: os"] } } }`
- **THEN** 前端从 `details.violations` 直接渲染列表,不需要解析 message

### Requirement: 本次 change 不扩展多模式回测契约

本次 change 的 `BacktestConfig` schema SHALL 仅描述当前后端已支持的单模式回测。`mode: "preview" | "deep"` 字段、显式的 `preview_lookback_days` / `deep_lookback_days` 分离、per-symbol 拆分的 response 等扩展 SHALL NOT 出现在本 change 产出的 `api/openapi.yaml` 中,留待 `api-contract-new-capabilities` 处理。

#### Scenario: 当前契约只描述单模式回测

- **WHEN** 查看 `BacktestConfig` schema
- **THEN** 它包含 `symbols: array<string>`(后端已支持,在此文档化);**不包含** `mode` 字段
- **THEN** `getBacktestResult` 的 `result` schema 是单一聚合结构,不包含 `per_symbol: Record<string, SymbolResult>` 子字段
