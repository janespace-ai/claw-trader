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
