# Capability: analysis-api

Synced on 2026-04-19 from archived delta specs in `openspec/changes/archive/`.

### From change: `api-contract-new-capabilities`

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

---

### From change: `backtest-engine-analysis-endpoints`

## ADDED Requirements

### Requirement: OptimLens 端点实现

系统 SHALL 实现 `POST /api/analysis/optimlens` + `GET /api/analysis/optimlens/{task_id}`:

- POST 接受 `OptimLensRequest` body,插入 `analysis_runs` 行(type=optimlens),启动 sweep goroutine,返回 canonical `TaskResponse { status: pending }`
- 后台: 展开 param_grid → 逐 combo 运行 sub-backtest(受 `max_concurrent_symbols` 限)→ 聚合 metrics → 调 LLM 合成 improvements → 写 result
- GET 从 DB 读 `analysis_runs` 行,返回 canonical `TaskResponse<OptimLensResult>`
- progress.phase: `"sweep"`(sub-backtests) → `"synthesize"`(LLM)

`OptimLensResult.improvements` SHALL 是结构化数组,符合契约 `OptimLensImprovement` shape。服务端 SHALL 通过 LLM 结构化输出 API(OpenAI json_schema 或 Anthropic tool use)或 post-validation 保证返回合法 JSON。

#### Scenario: 提交合法请求

- **WHEN** `POST /api/analysis/optimlens` body 含 `strategy_id` + `param_grid` × 2 params × 3 values = 6 combos + `symbols: ["BTC_USDT"]` + `lookback_days: 90`
- **THEN** 响应 200 + canonical `TaskResponse { task_id, status: "pending" }`
- **THEN** `analysis_runs` 行落库

#### Scenario: 网格超限

- **WHEN** `param_grid` 组合数 > 50
- **THEN** 响应 400 + `{ "error": { "code": "PARAM_GRID_TOO_LARGE", "details": { "submitted": 64, "max": 50 } } }`
- **THEN** 无 DB 写入

#### Scenario: Sweep 阶段进度

- **WHEN** 6 combos 中 3 个完成
- **THEN** `GET` 返回 `{ status: "running", progress: { phase: "sweep", done: 3, total: 6 }, ... }`

#### Scenario: Synthesize 阶段进度

- **WHEN** 6 个 sub-backtests 全完成,LLM 调用中
- **THEN** `progress: { phase: "synthesize", done: 0, total: 1 }`

#### Scenario: LLM 返回无效 JSON

- **WHEN** LLM 提供方返回无法解析的文本
- **THEN** 服务端尝试一次 retry + 加强 prompt
- **THEN** 仍失败则 `analysis_runs.status = failed`,`error.code = LLM_PROVIDER_FAILED`

#### Scenario: 成功完成

- **WHEN** 所有阶段 OK,LLM 返回合法 structured JSON
- **THEN** `result.improvements` 数组含 N 个 `OptimLensImprovement` 对象
- **THEN** 每个对象的 `title`/`category`/`rationale`/`expected_delta`/`suggested_change` 齐全

### Requirement: SignalReview 端点实现

系统 SHALL 实现 `POST /api/analysis/signals` + `GET /api/analysis/signals/{task_id}`:

- POST 接受 `backtest_task_id`,返回 canonical `TaskResponse`
- 后台: 读取对应 backtest 的 signals + 周边 kline context → 批量送 LLM(一次调用含所有 signals) → 解析 `SignalReviewResult`
- GET 返回 canonical `TaskResponse<SignalReviewResult>`
- progress.phase: `"fetch"` → `"llm"`

#### Scenario: 后端对应 backtest 有 20 signals

- **WHEN** `POST /api/analysis/signals` + `{ backtest_task_id: <X> }`
- **THEN** 服务端读 backtest,提取 20 signals
- **THEN** 发起一个 LLM 调用含所有 signals
- **THEN** 解析后 `result.verdicts.length == 20`,`result.summary.{good,questionable,bad}` 三类计数正确

#### Scenario: backtest_task_id 不存在

- **WHEN** 引用的 backtest 不存在
- **THEN** 400 + `BACKTEST_NOT_FOUND`

#### Scenario: signals 数超契约上限(100)

- **WHEN** backtest 产生 150 signals
- **THEN** 服务端截断到 top 100(按 pnl absolute value desc,重要的先审查)
- **THEN** 响应 `signals_total: 150` 与 `verdicts.length: 100`,前端可感知被截断

### Requirement: TradeExplain 端点实现(同步)

系统 SHALL 实现 `POST /api/analysis/trade`:

- 输入 `{ backtest_task_id, symbol, trade_id }` 或 `{ trade, klines_context }`(互斥 oneOf)
- 同步返回 `TradeExplainResult`
- 服务端设 20 秒 LLM 超时;超过则返回 504 `LLM_PROVIDER_FAILED`

#### Scenario: 通过 task_id + trade_id

- **WHEN** body `{ backtest_task_id: X, symbol: "BTC_USDT", trade_id: "#4" }`
- **THEN** 服务端查 backtest 的 trade #4 + 周边 50 根 K 线
- **THEN** 调 LLM 生成 narrative + indicators + exit reason
- **THEN** 同步返回 `TradeExplainResult`

#### Scenario: 直接传 trade

- **WHEN** body `{ trade: {...}, klines_context: [50 klines] }`
- **THEN** 服务端跳过查找,直接 LLM 调用
- **THEN** 响应 shape 一致

#### Scenario: LLM 超时

- **WHEN** LLM 调用 > 20 秒
- **THEN** 返回 504 + `{ "error": { "code": "LLM_PROVIDER_FAILED", "message": "llm call exceeded 20s timeout" } }`
- **THEN** HTTP 连接正常关闭

### Requirement: LLM provider 抽象 + OpenAI 初始实现

`backtest-engine/internal/llm/` SHALL 定义 `Provider` interface。至少 1 个 impl(OpenAI)SHALL 落地。配置通过 `config.yaml` 的 `llm:` 段:

```yaml
llm:
  provider: openai
  api_key: <from env>
  model: gpt-4o-mini
  timeout_sec: 30
```

#### Scenario: 配置从 env 读取 API key

- **WHEN** `config.yaml` 含 `llm.api_key_env: OPENAI_API_KEY`
- **THEN** 服务启动时 `os.Getenv("OPENAI_API_KEY")`
- **THEN** 未设置则 LLM 调用将失败为 `LLM_PROVIDER_FAILED`

#### Scenario: 切换 provider

- **WHEN** `config.yaml` `llm.provider: anthropic`
- **THEN** 服务使用 Anthropic 实现(若已提供);若未实现则启动时错误 panic(类型缺失)或 fallback 到 OpenAI + log warning

### Requirement: analysis_runs 表 + 持久化

系统 SHALL 新建 `{{.Schema}}.analysis_runs` 表(迁移 004)存储每次分析任务,所有分析端点(OptimLens / SignalReview / TradeExplain) SHALL 将请求与结果持久化到该表。

Fields: `id, type, config (jsonb), status, progress (jsonb), result (jsonb), error (jsonb), started_at, finished_at`。

#### Scenario: OptimLens 任务持久化

- **WHEN** 提交 OptimLens
- **THEN** `analysis_runs` 插入一行
- **THEN** sweep + LLM 过程中 progress 更新
- **THEN** 完成后 result 写入

#### Scenario: TradeExplain 也落 analysis_runs(同步)

- **WHEN** TradeExplain 调用
- **THEN** 插入一行 `type: trade`,完成后同步 result 存入
- **THEN** 便于审计 / debug

### Requirement: Param grid 展开 + 代码替换

`internal/service/sweep.go` 的 `RunGrid(base_code, grid) → []Variant` SHALL:

- 计算 cross-product of grid values
- 对每个 combo,通过正则替换 `self.param('<key>', <default>)` 为新值,生成 variant code
- 若某 key 在代码中找不到匹配模式,跳过该 variant 并在 `result.skipped: [reasons]` 中记录

#### Scenario: 正常展开

- **WHEN** `param_grid: { fast: [5, 10], slow: [20, 30] }` + code 含 `self.param('fast', 8)` 和 `self.param('slow', 25)`
- **THEN** 生成 4 个 variants:(5,20), (5,30), (10,20), (10,30)
- **THEN** 每个 variant 启动独立 sub-backtest

#### Scenario: 某 param 找不到

- **WHEN** grid 含 `volatility: [0.1, 0.2]` 但 code 里没有 `self.param('volatility', ...)`
- **THEN** 展开时跳过该维度(或整体报错,取决于策略)
- **THEN** 响应 `result.warnings: ["param 'volatility' not found in code"]`

---

