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
