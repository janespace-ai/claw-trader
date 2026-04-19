## ADDED Requirements

### Requirement: 数据网关 endpoint 纳入 OpenAPI 契约

`backtest-data-gateway` 能力涉及的所有 endpoint(`GET /api/klines`、`GET /api/symbols`、`GET /api/gaps`) SHALL 在 `api/openapi.yaml` 中有对应的 operation 定义,并 SHALL 在 `api/examples/` 下提供至少一个真实响应示例。

#### Scenario: 契约文件覆盖所有 gateway endpoint

- **WHEN** 检查 `api/openapi.yaml`
- **THEN** 能找到 `operationId: getKlines`、`listSymbols`、`listGaps` 各一个
- **THEN** 每个有对应的 `api/examples/<operationId>.json`

### Requirement: 数据网关参数和响应使用 Unix 秒

契约中 `getKlines` 的 `from` / `to` query 参数以及响应数组中每个 K 线对象的 `ts` 字段 SHALL 是 `integer`(Unix 秒)。`YYYY-MM-DD` 形态在契约中 deprecated;后端可能仍接受但未来可能收紧。

#### Scenario: 契约仅声明 integer 时间

- **WHEN** 查看 `getKlines` 的 query parameter schema 和 response `Kline` schema
- **THEN** `from`、`to`、`ts` 字段类型 `integer`

### Requirement: 数据网关错误使用受控 ErrorCode

当 `/api/klines`、`/api/symbols`、`/api/gaps` 返回非 2xx 时,response body SHALL 是 `ErrorResponse` 形态,`code` 取自 `ErrorCode` enum。

典型映射:
- 非法 interval → `INVALID_INTERVAL`(`details.allowed_intervals: [...]`)
- 非法 symbol(不在 `claw.symbols` 表中) → `SYMBOL_NOT_FOUND`
- 非法 range(`from > to` 或超出历史窗口) → `INVALID_RANGE`
- DB 不可达 → `UPSTREAM_UNREACHABLE`
- Timescale 返回空但 symbol 合法 → **不是**错误,返回空数组 + 200

#### Scenario: 非法 interval 返回结构化错误

- **WHEN** `GET /api/klines?symbol=BTC_USDT&interval=13m&from=...&to=...`
- **THEN** 响应 `400 Bad Request`,body `{ "error": { "code": "INVALID_INTERVAL", "message": "...", "details": { "allowed_intervals": ["5m", "15m", "30m", "1h", "4h", "1d"] } } }`

### Requirement: Symbols 列表支持 cursor 分页

`GET /api/symbols` 在契约中 SHALL 支持 `?limit=<n>&cursor=<opaque>` 分页。响应体在契约中 SHALL 不再是裸数组,而是 `{ "items": [...], "next_cursor": string | null }`。

后端对齐这一变更由后续 `backtest-engine-align-contract` change 负责;目前后端返回裸数组,contract-client 在 adapter 层包装为新 shape。

#### Scenario: 契约中 listSymbols 使用 cursor shape

- **WHEN** 查看 `openapi.yaml` 中 `listSymbols` 的 response schema
- **THEN** 它是 `{ items: Symbol[], next_cursor: string | null }`,不是裸 `Symbol[]`
- **THEN** `design.md` 注明前端 adapter 暂时从后端的裸数组构造 `{ items, next_cursor: null }`
