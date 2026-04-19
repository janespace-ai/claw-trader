## ADDED Requirements

### Requirement: OptimLens 参数优化分析端点

系统 SHALL 提供 `POST /api/analysis/optimlens` 接口,接受一个已有策略 ID + 参数网格,服务端执行跨积参数扫描(多个子回测)+ LLM 归纳,生成结构化的策略改进建议。任务使用 canonical `TaskResponse` 信封,通过 `GET /api/analysis/optimlens/{task_id}` 轮询。

`OptimLensResult.improvements` SHALL 是一个结构化数组,每个元素包含 `title`、`category`、`rationale`、`expected_delta`(含 `sharpe`、`max_drawdown`、`win_rate` 的相对变化)、`suggested_change`(`kind: "param_update" | "code_edit"`)。

#### Scenario: 提交 OptimLens 任务

- **WHEN** 调用 `POST /api/analysis/optimlens`,body `{ "strategy_id": "<uuid>", "symbols": ["BTC_USDT"], "param_grid": { "fast": [5, 10, 20], "slow": [20, 30, 50] }, "lookback_days": 90 }`
- **THEN** 服务端校验网格大小 ≤ `PARAM_GRID_TOO_LARGE` 阈值(默认 50)
- **THEN** 返回 canonical `TaskResponse`,`task_id`、`status: "pending"`、`started_at`
- **THEN** 服务端异步执行参数扫描 + LLM 归纳

#### Scenario: 轮询 OptimLens 结果(running)

- **WHEN** `GET /api/analysis/optimlens/{task_id}` 在任务进行中
- **THEN** 返回 `TaskResponse` 带 `status: "running"` 与 `progress: { phase: "sweep" | "synthesize", done: integer, total: integer }`
- **THEN** `result` 字段不存在

#### Scenario: OptimLens 完成返回结构化 improvements

- **WHEN** 任务完成
- **THEN** 返回 `status: "done"` + `result: { base_metrics, grid_results, improvements: OptimLensImprovement[] }`
- **THEN** 每个 `improvement` 具备契约中定义的完整字段结构
- **THEN** 前端 UI 可直接渲染 `title`、`rationale`、`expected_delta`,无需解析自然语言

#### Scenario: 参数网格超限

- **WHEN** 提交的 `param_grid` 组合数超过阈值
- **THEN** 返回 400 + `{ "error": { "code": "PARAM_GRID_TOO_LARGE", "message": "...", "details": { "submitted": 128, "max": 50 } } }`

#### Scenario: LLM 提供方失败

- **WHEN** OptimLens 的 LLM 推理阶段失败(provider 超时、无效输出等)
- **THEN** 任务最终 `status: "failed"` + `error: { code: "LLM_PROVIDER_FAILED", message: ..., details: { provider: "openai" } }`

### Requirement: SignalReview 信号复查分析端点

系统 SHALL 提供 `POST /api/analysis/signals` 接口,输入一个 Preview 回测的 `task_id`,输出对该回测产生的每个信号的定性 verdict。任务异步,通过 `GET /api/analysis/signals/{task_id}` 轮询。

`SignalReviewResult.verdicts` SHALL 是数组,每个元素包含 `signal_id`、`symbol`、`entry_ts`(Unix 秒)、`verdict: "good" | "questionable" | "bad"`、`note`。`summary` SHALL 给出三类计数。

#### Scenario: 提交 Signal Review

- **WHEN** `POST /api/analysis/signals`,body `{ "backtest_task_id": "<uuid>" }`
- **THEN** 返回 `TaskResponse` + `status: "pending"`
- **THEN** 服务端读取对应 backtest 的 signals + 各自的 context(指标值、regime),交给 LLM 逐条评判

#### Scenario: 完成后返回分类 verdicts

- **WHEN** 轮询到 `status: "done"`
- **THEN** `result.verdicts` 数组长度 ≤ 100(契约默认上限)
- **THEN** `result.summary` 三类计数之和等于 `verdicts.length`
- **THEN** 前端渲染三色 pill(绿/黄/红),点击单条 pill 跳到对应 symbol 的 chart bar

### Requirement: TradeExplain 逐笔交易解释端点(同步)

系统 SHALL 提供 `POST /api/analysis/trade` 接口,**同步**返回对单笔交易的自然语言解释 + 指标上下文。响应 body 是 `TradeExplainResult`,不使用 task 信封。

入参 SHALL 支持两种形态:`{ backtest_task_id, symbol, trade_id }`(服务端查找 trade 上下文)或直接传 `{ trade: Trade, klines_context: Kline[] }`(caller 已持有 trade 数据,减少 round-trip)。两者 SHALL 互斥。

服务端 LLM 调用 SHALL 设 20 秒上限;超时返回 `LLM_PROVIDER_FAILED` 而非挂起 HTTP。

#### Scenario: 通过 task_id + trade_id 请求

- **WHEN** `POST /api/analysis/trade`,body `{ "backtest_task_id": "<uuid>", "symbol": "BTC_USDT", "trade_id": "#12" }`
- **THEN** 服务端查找该 trade 的 entry/exit + 周边 50 根 K 线,调用 LLM
- **THEN** 同步返回 `TradeExplainResult` 含 `narrative`(3-5 句)、`entry_context.indicators`、`exit_context.reason`

#### Scenario: 直接传 trade 上下文

- **WHEN** body 包含 `{ "trade": {...}, "klines_context": [...] }`
- **THEN** 服务端跳过查找步骤,直接生成 narrative
- **THEN** 响应字段形态一致

#### Scenario: LLM 超时

- **WHEN** LLM 调用 > 20 秒
- **THEN** 返回 `504 Gateway Timeout` + `{ "error": { "code": "LLM_PROVIDER_FAILED", "message": "llm timeout" } }`
- **THEN** HTTP 连接正常关闭,不挂起

### Requirement: Analysis 端点 LLM 预算错误码

所有 `analysis-api` 端点 SHALL 声明 `LLM_BUDGET_EXCEEDED` 作为可能的错误响应。此错误码表示 "此任务/此用户/此时段的 LLM token 预算已超支";本 change 仅定义 shape,具体 budget 追踪策略由后续 backend 实现 change 决定。

#### Scenario: OptimLens 触发预算限制

- **WHEN** 一次 OptimLens 请求估算需要 100k tokens,但该用户剩余预算只有 20k
- **THEN** 返回 `402 Payment Required`(或 `429 Too Many Requests`)+ `{ "error": { "code": "LLM_BUDGET_EXCEEDED", "message": "...", "details": { "budget_remaining": 20000, "estimated_cost": 100000 } } }`
- **THEN** 前端渲染 "AI quota exhausted" 类文案
