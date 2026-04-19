## ADDED Requirements

### Requirement: 单 symbol metadata 端点

系统 SHALL 提供 `GET /api/symbols/{symbol}/metadata` 接口,返回单个 symbol 的完整 metadata bundle,供 Symbol Detail 页面 header 和 Strategy Management 的策略卡片使用。

`SymbolMetadata` schema SHALL 包含:`symbol: string`、`name: string`、`market: string`、`rank: integer | null`、`volume_24h_quote: number | null`、`last_price: number`、`change_24h_pct: number`、`first_kline_at: integer (unix s)`、`last_kline_at: integer (unix s)`、`status: "active" | "inactive"`。

#### Scenario: 获取 BTC_USDT metadata

- **WHEN** `GET /api/symbols/BTC_USDT/metadata`
- **THEN** 返回 200 + `SymbolMetadata` 对象
- **THEN** `name` 至少是 symbol 去掉 `_USDT` 后的字符串(例如 `"BTC"`),未来可增强为完整名称
- **THEN** `last_price` 由后端从最近的 1h 或 5m K 线计算
- **THEN** `change_24h_pct` 由后端从最近的 24h K 线计算

#### Scenario: symbol 不存在

- **WHEN** 请求不在 `claw.symbols` 表中的 symbol
- **THEN** 返回 404 + `{ "error": { "code": "SYMBOL_NOT_FOUND", "message": "...", "details": { "requested": "XYZ_USDT" } } }`

#### Scenario: symbol 存在但无 K 线数据

- **WHEN** symbol 已登记但 aggregator 还未同步到任何 K 线
- **THEN** 返回 200 + `SymbolMetadata` 含 `last_price: null`、`change_24h_pct: null`、`first_kline_at: null`、`last_kline_at: null`
- **THEN** 前端渲染 "—" 占位,不当 SYMBOL_NOT_FOUND 处理

### Requirement: Symbol metadata 端点纳入 OpenAPI

本端点 SHALL 在 `api/openapi.yaml` 中以 `operationId: getSymbolMetadata` 定义。path 参数 `symbol` 类型 `string`,pattern 匹配 `^[A-Z0-9_]+$`(防止意外字符)。

#### Scenario: 非法 symbol 格式

- **WHEN** 请求 `GET /api/symbols/../../etc/passwd/metadata`
- **THEN** 因 path pattern 不匹配 → 404 (router 级) 或 400 + `INVALID_SYMBOL`
- **THEN** 绝不让请求触达 DB
