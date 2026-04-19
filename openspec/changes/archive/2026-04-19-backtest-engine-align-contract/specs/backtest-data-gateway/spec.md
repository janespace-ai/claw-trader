## MODIFIED Requirements

### Requirement: K 线数据查询接口

`GET /api/klines` SHALL 遵守 canonical 契约:

- Query 参数:`from` / `to` 接受 Unix 秒(integer)。接受 `YYYY-MM-DD` 字符串时 SHALL 在响应中加 `Warning: 299 - "deprecated: use unix seconds"` header。
- 响应 Kline 对象的 `ts` 字段为 Unix 秒(integer)。
- 错误响应使用 canonical envelope,code ∈ { `INVALID_INTERVAL`, `INVALID_SYMBOL`, `INVALID_RANGE`, `UPSTREAM_UNREACHABLE` }。

#### Scenario: 非法 interval

- **WHEN** `GET /api/klines?symbol=BTC_USDT&interval=13m&from=...&to=...`
- **THEN** 400 + `{ "error": { "code": "INVALID_INTERVAL", "message": "...", "details": { "allowed_intervals": ["5m","15m","30m","1h","4h","1d"] } } }`

#### Scenario: 时间参数接受 Unix 秒

- **WHEN** `from=1700000000&to=1732000000`
- **THEN** 正常响应,无 deprecation header

#### Scenario: 时间参数接受 ISO(deprecated)

- **WHEN** `from=2025-04-01&to=2026-04-01`
- **THEN** 正常响应 + `Warning` header 提示 deprecation

### Requirement: 币种列表查询接口 cursor 分页

`GET /api/symbols` SHALL 返回 `{ items: Symbol[], next_cursor: string | null }` 形态。接受 `?limit=<n>` + `?cursor=<opaque>`。

#### Scenario: 默认列表

- **WHEN** `GET /api/symbols?market=futures&limit=50`
- **THEN** 返回 `{ items: [50 symbols], next_cursor: "<opaque>" }` 或 `next_cursor: null` 若总数 ≤ 50

#### Scenario: 使用 cursor 翻页

- **WHEN** `GET /api/symbols?cursor=<opaque>`
- **THEN** 返回该位置之后的一页

### Requirement: Gap 查询接口错误码

`GET /api/gaps` SHALL 错误路径使用 canonical envelope,code ∈ { `INVALID_SYMBOL`, `INVALID_INTERVAL` }。正常响应是裸 `Gap[]`(该端点数据量小,不需分页)。

#### Scenario: 非法过滤

- **WHEN** `?symbol=DOES_NOT_EXIST`
- **THEN** 响应 200 + 空数组(`SYMBOL_NOT_FOUND` 不适用于过滤场景)
