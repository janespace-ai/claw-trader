# backtest-api Specification

## Purpose

TBD — created by archiving change service-api. Update Purpose after archive.
## Requirements
### Requirement: 提交回测任务 API

系统 SHALL 提供 `POST /api/backtest/start` 接口提交回测任务，响应遵循 canonical `TaskResponse` 信封形态。提交后系统 **串联执行两道 Gate**（Gate 1: AST 静态分析；Gate 2: DeepSeek AI 语义审查），两道均 approve 才把任务推送给 sandbox-service 执行。任意 Gate reject 立即拒绝请求，不创建执行记录。

#### Scenario: 提交合法单次回测

- **WHEN** 调用 `POST /api/backtest/start` 合法 body 且代码通过两道 Gate
- **THEN** 响应为 canonical TaskResponse:
  ```json
  { "task_id": "<uuid>", "status": "pending", "started_at": 1700000000 }
  ```
- **THEN** 系统依次执行 Gate 1 → Gate 2
- **THEN** 两 Gate 均 approve 后向 sandbox-service 推送任务
- **THEN** 数据库任务记录含 `gate1_verdict = approve`、`gate2_verdict = approve`
- **THEN** 没有 legacy 扁平字段

#### Scenario: Gate 1（合规）失败

- **WHEN** 代码含 `import os`
- **THEN** Gate 1 reject，系统 **不** 调用 Gate 2
- **THEN** 响应 400 + canonical error envelope:
  ```json
  {
    "error": {
      "code": "COMPLIANCE_FAILED",
      "message": "...",
      "details": { "violations": ["forbidden import: os"] }
    }
  }
  ```

#### Scenario: Gate 2（AI）拒绝

- **WHEN** 代码通过 Gate 1，但 Gate 2 DeepSeek 判定 reject（例如死循环、逃逸尝试、逻辑严重错误）
- **THEN** 响应 403 + canonical error envelope:
  ```json
  {
    "error": {
      "code": "AI_REJECTED",
      "message": "AI review rejected the code",
      "details": {
        "reason": "infinite loop without break condition",
        "dimension": "security" | "correctness",
        "model": "deepseek-reasoner"
      }
    }
  }
  ```
- **THEN** 不创建任务记录；没有 sandbox-service 推送
- **THEN** `AI_REJECTED` 是终止态——无论客户端带什么参数都无法覆盖（见 `code-review` 的 "Gate 2 reject 永不可覆盖" 需求）

#### Scenario: Gate 2 不可用（fail-closed）

- **WHEN** DeepSeek 超时 / 网络错误 / 5xx
- **THEN** 响应 503 + canonical error envelope:
  ```json
  {
    "error": {
      "code": "AI_REVIEW_UNAVAILABLE",
      "message": "AI review service is temporarily unavailable",
      "details": { "reason": "timeout after 30s" | "connection refused" | ... }
    }
  }
  ```
- **THEN** 不创建任务记录；用户可稍后重试

#### Scenario: 沙箱超时

- **WHEN** 两 Gate 通过、任务已在 sandbox-service 执行，但 worker 运行超过 30 分钟（`RLIMIT_CPU`）
- **THEN** 任务最终 `status: "failed"` + `error: { code: "SANDBOX_TIMEOUT", ... }`

#### Scenario: 沙箱服务不可用

- **WHEN** 两 Gate 通过，但 sandbox-service 容器 down 或返回 5xx
- **THEN** 任务 `status: "failed"` + `error: { code: "SANDBOX_UNAVAILABLE", message: "..." }`
- **THEN** 用户端 FriendlyError 提示 "执行服务暂不可用，请稍后重试"

### Requirement: 查询回测进度 API

系统 SHALL 提供 `GET /api/backtest/status/:task_id` 接口查询回测任务进度。

#### Scenario: 查询运行中的任务

- **WHEN** 调用 `GET /api/backtest/status/{task_id}` 且任务正在执行
- **THEN** 返回：
  ```json
  {
    "task_id": "uuid",
    "status": "running",
    "mode": "single",
    "progress": {"phase": "backtesting", "current_bar": 5000, "total_bars": 10000},
    "started_at": "2026-04-16T10:00:00Z"
  }
  ```

#### Scenario: 查询参数优化进度

- **WHEN** 查询参数优化任务的进度
- **THEN** 返回：
  ```json
  {
    "task_id": "uuid",
    "status": "running",
    "mode": "optimization",
    "progress": {"current_run": 5, "total_runs": 9, "phase": "backtesting"},
    "started_at": "2026-04-16T10:00:00Z"
  }
  ```

#### Scenario: 查询不存在的任务

- **WHEN** 调用 `GET /api/backtest/status/{task_id}` 且 task_id 不存在
- **THEN** 返回 HTTP 404：`{"error": "task_not_found"}`

### Requirement: 获取回测结果 API

系统 SHALL 提供 `GET /api/backtest/result/:task_id` 接口获取回测结果。

#### Scenario: 获取已完成任务结果

- **WHEN** 调用 `GET /api/backtest/result/{task_id}` 且任务已完成
- **THEN** 返回完整回测结果，包含：
  - `metrics`: 所有指标（ALL/LONG/SHORT 三维度）
  - `equity_curve`: 权益曲线时间序列
  - `drawdown_curve`: 回撤曲线时间序列
  - `monthly_returns`: 月度收益数据
  - `trades`: 完整交易列表
  - `config`: 回测配置
  - `optimization_results`: 参数优化结果（仅优化模式）

#### Scenario: 获取失败任务结果

- **WHEN** 调用 `GET /api/backtest/result/{task_id}` 且任务已失败
- **THEN** 返回 `{"task_id": "...", "status": "failed", "error": "错误信息", "traceback": "..."}`

#### Scenario: 获取未完成任务结果

- **WHEN** 调用 `GET /api/backtest/result/{task_id}` 且任务仍在运行
- **THEN** 返回 HTTP 202：`{"task_id": "...", "status": "running", "message": "task still in progress"}`

### Requirement: 提交选币任务 API

系统 SHALL 提供 `POST /api/screener/start` 接口提交选币任务。提交后系统 **串联执行两道 Gate**（AST + AI），两 Gate 均 approve 才推送给 sandbox-service。任意 Gate reject 拒绝请求。

#### Scenario: 提交合法选币

- **WHEN** 调用 `POST /api/screener/start` body `{ "code": "...", "config": { "market": "futures", "lookback_days": 90 } }` 且通过两道 Gate
- **THEN** 返回 canonical `TaskResponse` `{ task_id, status: "pending", started_at }`
- **THEN** 系统先执行 Gate 1 → Gate 2，均 approve 后推送给 sandbox-service

#### Scenario: Gate 1 失败

- **WHEN** 选币代码未通过 AST 合规检查
- **THEN** 返回 HTTP 400 + canonical error envelope `{ "error": { "code": "COMPLIANCE_FAILED", "details": { "violations": [...] } } }`

#### Scenario: Gate 2 拒绝

- **WHEN** 选币代码通过 Gate 1，但被 AI 判定恶意或严重逻辑错误
- **THEN** 返回 HTTP 403 + canonical error envelope `{ "error": { "code": "AI_REJECTED", "details": { "reason": "...", "dimension": "..." } } }`

### Requirement: 获取选币结果 API

系统 SHALL 提供 `GET /api/screener/result/:task_id` 接口获取选币结果。

#### Scenario: 获取选币结果

- **WHEN** 调用 `GET /api/screener/result/{task_id}` 且任务已完成
- **THEN** 返回：
  ```json
  {
    "task_id": "uuid",
    "status": "done",
    "total_symbols": 300,
    "passed": 45,
    "results": [
      {"symbol": "BTC_USDT", "passed": true, "score": 0.95},
      {"symbol": "ETH_USDT", "passed": true, "score": 0.87}
    ]
  }
  ```

### Requirement: 策略代码管理 API

系统 SHALL 提供策略代码的 CRUD 接口，支持保存和复用策略。

#### Scenario: 保存策略代码

- **WHEN** 调用 `POST /api/strategies` body:
  ```json
  {
    "name": "SMA Crossover",
    "code_type": "strategy",
    "code": "class MyStrategy(Strategy): ..."
  }
  ```
- **THEN** 返回 `{"id": "uuid", "name": "SMA Crossover", "created_at": "..."}`

#### Scenario: 查询策略列表

- **WHEN** 调用 `GET /api/strategies`
- **THEN** 返回所有已保存策略列表，按 created_at 降序

#### Scenario: 查询历史回测列表

- **WHEN** 调用 `GET /api/backtest/history?strategy_id={id}&limit=20`
- **THEN** 返回该策略的历史回测记录列表（含摘要指标）

### Requirement: 内部 Callback Endpoint

系统 SHALL 提供内部 HTTP endpoint 供沙箱容器回调报告进度和结果。这些 endpoint 不对外暴露。

#### Scenario: 接收进度回调

- **WHEN** 沙箱容器调用 `POST /internal/cb/progress`
- **THEN** 系统更新任务的 progress 字段

#### Scenario: 接收完成回调

- **WHEN** 沙箱容器调用 `POST /internal/cb/complete`
- **THEN** 系统将任务状态更新为 `done`
- **THEN** 存储回测结果到数据库
- **THEN** 触发容器清理

#### Scenario: 接收错误回调

- **WHEN** 沙箱容器调用 `POST /internal/cb/error`
- **THEN** 系统将任务状态更新为 `failed`
- **THEN** 存储错误信息
- **THEN** 触发容器清理

---

### Requirement: 新增错误码 AI_REJECTED 与 AI_REVIEW_UNAVAILABLE

系统 SHALL 在 `api/openapi.yaml` 的 `ErrorCode` enum 中新增两个值：`AI_REJECTED`（Gate 2 拒绝代码）和 `AI_REVIEW_UNAVAILABLE`（Gate 2 服务不可用）。两者的 HTTP 状态码固定：`AI_REJECTED` = 403、`AI_REVIEW_UNAVAILABLE` = 503。

#### Scenario: 契约声明

- **WHEN** 查看 `api/openapi.yaml`
- **THEN** `ErrorCode` enum 含 `AI_REJECTED`、`AI_REVIEW_UNAVAILABLE`
- **THEN** 两者在 `/api/backtest/start` 与 `/api/screener/start` 的 `responses` 中被列为可能的错误返回

#### Scenario: 客户端可识别

- **WHEN** 桌面客户端收到 `{ error: { code: "AI_REJECTED" } }`
- **THEN** `FriendlyError` 规则表（`desktop-client/src/services/errors/friendly.ts`）能匹配到对应的 `errors.friendly.ai_rejected.*` 翻译键
- **THEN** UI 显示友好标题（例如 "AI 审查拒绝了这段代码"）+ hint（例如 "请查看详情并修改后重试"）+ 可展开的 raw reason

### Requirement: Gate 2 审查决定不写入 backtest_runs 的成功路径

系统 SHALL 仅在两道 Gate **都** approve 之后才向 `claw.backtest_runs` / `claw.screener_runs` 插入运行记录。Gate 1 或 Gate 2 的 reject SHALL NOT 创建运行记录——它们只在审计表（`claw.ai_review_audit`）留痕。

#### Scenario: Gate 2 reject 不污染 runs

- **WHEN** 代码通过 Gate 1 但被 Gate 2 reject
- **THEN** `claw.backtest_runs` 表无新增行
- **THEN** `claw.ai_review_audit` 新增一行记录此次 reject

#### Scenario: Gate 1 reject 也不污染

- **WHEN** 代码被 Gate 1 reject
- **THEN** `claw.backtest_runs` 表无新增行
- **THEN** 仅返回错误响应，不调用 DeepSeek（节省 API 费用）

## Synced additions (2026-04-19)

### From change: `api-contract-foundation`

## ADDED Requirements

### Requirement: 回测 API 纳入 OpenAPI 契约

`backtest-api` 能力涉及的所有 endpoint(`POST /api/backtest/start`、`GET /api/backtest/status/{task_id}`、`GET /api/backtest/result/{task_id}`、`GET /api/backtest/history`) SHALL 在 `api/openapi.yaml` 中有对应的 operation 定义,并 SHALL 在 `api/examples/` 下提供至少一个真实 request + response 示例。

#### Scenario: 契约文件覆盖所有回测 endpoint

- **WHEN** 检查 `api/openapi.yaml`
- **THEN** 能找到 `operationId: startBacktest`、`getBacktestStatus`、`getBacktestResult`、`listBacktestHistory` 各一个
- **THEN** 每个都有对应的 `api/examples/<operationId>.json`

### Requirement: 回测任务响应使用 canonical TaskResponse

`GET /api/backtest/status/{task_id}` 和 `GET /api/backtest/result/{task_id}` 在契约中 SHALL 返回 `TaskResponse`(见 `api-contract` 能力)的 shape,`result` 字段由回测领域特定 schema narrow(equity curve、metrics、trades、per-symbol 拆分)。

当前后端实现可能尚未完全对齐该 shape;本 change 仅冻结**契约目标**,实际后端对齐由后续 `service-api-align-contract` change 负责。前端通过 `cremote` 的 adapter 层过渡。

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

---

### From change: `api-contract-new-capabilities`

## ADDED Requirements

### Requirement: 回测请求支持多 symbol

契约中 `BacktestConfig.symbols` SHALL 是 `string[]`,长度 1..N。服务端对每个 symbol 执行回测,最终结果既有聚合 summary 也有 per-symbol 明细。

前置 change(`api-contract-foundation`)的 BacktestConfig schema 只描述单 symbol 形态(实际 `symbols` 已为数组字段,当时声明 1..1);本 change SHALL 正式放开为 1..N,并补充聚合与拆分的响应语义。

#### Scenario: 多 symbol 请求被契约接受

- **WHEN** `POST /api/backtest/start`,body.config.symbols = `["BTC_USDT","ETH_USDT","SOL_USDT"]`
- **THEN** 服务端接受请求,返回 canonical `TaskResponse`
- **THEN** 契约中 `BacktestConfig` schema 的 `symbols: array, minItems: 1, maxItems: 50`(50 是暂定上限,防止误提 300)

### Requirement: Preview / Deep 模式字段

契约中 `BacktestConfig.mode` SHALL 是枚举 `"preview" | "deep"`。服务端根据 mode 设置默认 lookback:preview = 7 天,deep = 180 天。caller SHALL 可覆盖 `preview_lookback_days` / `deep_lookback_days`。

#### Scenario: preview 模式走短窗口

- **WHEN** body `{ "code": "...", "config": { "symbols": ["BTC_USDT"], "mode": "preview" } }`
- **THEN** 服务端默认跑 7 天 lookback
- **THEN** 返回 `task_id`,Preview Backtest workspace 消费该结果

#### Scenario: deep 模式带自定义窗口

- **WHEN** body.config.mode = "deep",body.config.deep_lookback_days = 365
- **THEN** 服务端跑 365 天回测
- **THEN** 响应的 `BacktestResult` 包含完整 metrics grid + drawdown + monthly_returns

### Requirement: 回测结果拆 summary + per_symbol

契约中 `BacktestResult` SHALL 含两个顶层字段:

- `summary`:跨 symbol 聚合的 `{ metrics, equity_curve, drawdown_curve, monthly_returns }`(等权重平均)
- `per_symbol: Record<string, SymbolResult>`:以 symbol 为 key 的详细结果 `{ metrics, equity_curve, trades, signals }`

前端 Preview / Deep / Symbol Detail 三个 workspace 都从同一个 result 对象读不同切片。

#### Scenario: 多 symbol 回测完成

- **WHEN** 3 个 symbol 的 deep backtest 完成
- **THEN** `result.summary.metrics.total_return` 是三者简单平均
- **THEN** `result.per_symbol["BTC_USDT"].metrics.total_return` 是 BTC 单独的值
- **THEN** `result.per_symbol` 对象恰好有 3 个键

### Requirement: MetricsBlock 完整字段

契约中 `MetricsBlock` SHALL 包含: `total_return: number`、`sharpe: number`、`sortino: number`、`calmar: number`、`profit_factor: number`、`win_rate: number`、`avg_trade: number`、`avg_hours_in_trade: number`、`positive_days_ratio: number`、`max_drawdown: number`、`total_trades: integer`。所有数字字段 `null` 表示数据不足无法计算。

#### Scenario: 回测只有 3 笔交易,部分 metrics 无意义

- **WHEN** deep backtest 整个窗口只产出 3 笔 trade
- **THEN** `profit_factor`、`sortino` 可能返回 `null`(样本太小)
- **THEN** 前端见到 `null` 渲染 "—" 不崩溃

### Requirement: 多 symbol 相关错误码

契约 SHALL 定义以下错误场景:

- `INVALID_SYMBOL`:列表中有非法 symbol。`details.invalid_symbols: string[]`
- `DATA_UNAVAILABLE`:任一 symbol 在请求 range 内没有数据。`details.missing: [{symbol, missing_range: {from,to}}]`

#### Scenario: 列表中一个 symbol 非法

- **WHEN** `symbols = ["BTC_USDT","DOES_NOT_EXIST","ETH_USDT"]`
- **THEN** 返回 400 + `{ "error": { "code": "INVALID_SYMBOL", "details": { "invalid_symbols": ["DOES_NOT_EXIST"] } } }`
- **THEN** **不**启动任何 symbol 的回测;全部校验后再开跑(避免半成品任务)

---

### From change: `service-api-align-contract`

## MODIFIED Requirements

### Requirement: 提交回测任务 API

系统 SHALL 提供 `POST /api/backtest/start` 接口提交回测任务,响应遵循 canonical `TaskResponse` 信封形态(见 `api-contract` 能力)。任务 ID、状态、开始时间等字段使用 Unix 秒(integer)。

#### Scenario: 提交单次回测

- **WHEN** 调用 `POST /api/backtest/start` 合法 body
- **THEN** 响应为 canonical TaskResponse:
  ```json
  {
    "task_id": "<uuid>",
    "status": "pending",
    "started_at": 1700000000
  }
  ```
- **THEN** 系统执行合规检查 + 启动沙箱
- **THEN** 没有 legacy 扁平字段(如直接在根的 `mode`、`s3_progress` 等)

#### Scenario: 合规失败

- **WHEN** 代码含 `import os`
- **THEN** 响应 400 + canonical error envelope:
  ```json
  {
    "error": {
      "code": "COMPLIANCE_FAILED",
      "message": "...",
      "details": { "violations": ["forbidden import: os"] }
    }
  }
  ```

#### Scenario: 沙箱超时

- **WHEN** 沙箱运行超时
- **THEN** 任务最终 `status: "failed"` + `error: { code: "SANDBOX_TIMEOUT", ... }`

### Requirement: 回测状态与结果 API

`GET /api/backtest/status/{task_id}` 与 `GET /api/backtest/result/{task_id}` SHALL 返回 canonical `TaskResponse` 形态,`result` 字段(仅 status=done 时)包含回测领域特定 schema。时间字段全部 Unix 秒。

#### Scenario: status 端点返回 canonical 信封

- **WHEN** 任务 running,调用 `GET /api/backtest/status/{task_id}`
- **THEN** 响应:
  ```json
  {
    "task_id": "...",
    "status": "running",
    "progress": { "phase": "sandbox", "done": 50, "total": 100 },
    "started_at": 1700000000
  }
  ```
- **THEN** `result` 字段不存在,`error` 字段不存在

#### Scenario: result 端点返回完整结果

- **WHEN** 任务 done
- **THEN** `status: "done"` + `result: BacktestResult` + `finished_at: <ts>`
- **THEN** `BacktestResult` 的所有时间字段为 Unix 秒

### Requirement: 回测历史 API 使用 cursor 分页

`GET /api/backtest/history` SHALL 返回 cursor-分页形态 `{ items: BacktestHistoryItem[], next_cursor: string | null }`。接受 `?limit=<n>` + `?cursor=<opaque>`。不再返回裸数组。

#### Scenario: 分页列出历史

- **WHEN** 调用 `GET /api/backtest/history?limit=20`
- **THEN** 响应含 `items`(≤20 条)+ `next_cursor`
- **THEN** 下一页用 `GET /api/backtest/history?cursor=<opaque>&limit=20`

### Requirement: 删除 legacy 响应形态支持

`backtest-api` 的所有 handler SHALL 不再生成 legacy 扁平形态。`desktop-client/src/services/remote/legacy-adapter.ts` 中对应的适配函数 SHALL 被删除。

#### Scenario: 适配器被移除后 cremote 正常工作

- **WHEN** 从 UI 任意屏幕调用 `cremote.startBacktest(...)`
- **THEN** 请求直接打到新 handler,响应直接使用(无适配)
- **THEN** 类型检查通过(`src/types/api.d.ts` 匹配真实后端输出)

---

### From change: `service-api-multi-symbol-support`

## MODIFIED Requirements

### Requirement: 提交回测任务 API

`POST /api/backtest/start` SHALL 完整支持 `config.symbols: string[]`(1..50 个元素)和 `config.mode: "preview" | "deep"`。

服务端行为:
- 验证所有 symbols 合法(存在于 `claw.symbols` 表)+ interval 合法 + range 有数据
- 根据 mode 应用默认 lookback(preview=7d, deep=180d),或 caller 显式 `preview_lookback_days` / `deep_lookback_days` 覆盖
- 通过验证后插入一条 `backtest_runs` 行,启动 N 个 sandbox(每 symbol 一个,并发受 `max_concurrent_symbols` 限制)
- 返回 canonical `TaskResponse`,`status: "pending"`

#### Scenario: 提交 3-symbol preview 回测

- **WHEN** body `{ "code": "...", "config": { "symbols": ["BTC_USDT","ETH_USDT","SOL_USDT"], "interval": "1h", "mode": "preview" } }`
- **THEN** 服务端验证所有 3 个 symbol,从当前时间向前 7 天
- **THEN** 返回 TaskResponse `status: pending, task_id, started_at`
- **THEN** 后台启动 3 个 sandbox(并发最多 `max_concurrent_symbols`)

#### Scenario: 非法 symbol 阻止启动

- **WHEN** `symbols = ["BTC_USDT","NOPE_USDT"]`
- **THEN** 响应 400 + `{ "error": { "code": "INVALID_SYMBOL", "details": { "invalid_symbols": ["NOPE_USDT"] } } }`
- **THEN** 数据库无新建 `backtest_runs` 行
- **THEN** 无 sandbox 启动

#### Scenario: 数据缺失阻止启动

- **WHEN** `symbols = ["XYZ_USDT"]` 但该 symbol 在 `claw.futures_1h` 中没有请求 range 内的数据
- **THEN** 响应 400 + `{ "error": { "code": "DATA_UNAVAILABLE", "details": { "missing": [{ "symbol": "XYZ_USDT", "missing_range": { "from": ..., "to": ... } }] } } }`

#### Scenario: mode conflict

- **WHEN** body `config.mode = "preview", config.deep_lookback_days = 365`
- **THEN** 响应 400 + `INVALID_RANGE`(message 说明 preview + deep lookback 互斥)

### Requirement: 回测结果 summary + per_symbol 拆分

`result` 响应 body SHALL 严格分为 `summary` 和 `per_symbol` 两部分:

- `summary`: 跨 symbol 聚合 `{ metrics, equity_curve, drawdown_curve, monthly_returns }`。metrics 从 summary equity_curve 计算,**不是**从 per-symbol 平均。
- `per_symbol: Record<string, SymbolResult>`:每 symbol 单独 `{ metrics, equity_curve, trades, signals }`

#### Scenario: 3 symbol 回测完成

- **WHEN** 3 个 sandbox 全部完成
- **THEN** service 聚合 summary(equal-weighted equity curves)
- **THEN** `result.summary.metrics.total_return` 从 summary.equity_curve 的头尾差计算
- **THEN** `result.per_symbol["BTC_USDT"].metrics.total_return` 是 BTC 独立值
- **THEN** `result.per_symbol` 有恰好 3 个 keys

#### Scenario: 单 symbol 降级为 N=1

- **WHEN** `symbols.length === 1`
- **THEN** `per_symbol` 仍然是 map,含 1 个 key
- **THEN** `summary === per_symbol[sym]` 内容上基本等价(metrics 同,equity 同)

### Requirement: 任务进度反映多 symbol 调度

`GET /api/backtest/status/{task_id}` 在运行期间 SHALL 报告:

- `progress.phase`: `"validate" | "backtest" | "aggregate"`
- `progress.done`: 当前 phase 已完成的子步骤数
- `progress.total`: 当前 phase 的总子步骤数

backtest phase 中 total = symbols 数。

#### Scenario: 10 symbol 回测进度

- **WHEN** 提交 10 symbol 的 deep backtest,此时 4 个 sandbox 跑完,3 个 in-flight,3 个等待
- **THEN** `progress: { phase: "backtest", done: 4, total: 10 }`
- **THEN** 随着 sandbox 完成,done 递增

#### Scenario: 进入 aggregate phase

- **WHEN** 所有 10 个 sandbox 完成,聚合阶段开始
- **THEN** 短时显示 `progress: { phase: "aggregate", done: 0, total: 1 }`
- **THEN** 聚合完成后 `status: "done"` + 完整 result

---

