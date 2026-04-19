# backtest-data-gateway Specification

## Purpose

Read-only HTTP endpoints served by `backtest-engine` that expose market data (K-lines, symbols, gap info) to the desktop-client and other frontends. These endpoints replace the ones previously served by `data-aggregator` — the aggregator is now a headless worker and cannot be reached from outside. All reads are sourced directly from the shared TimescaleDB that the aggregator writes to.

## Requirements

### Requirement: K 线数据查询接口

`backtest-engine` SHALL 提供 `GET /api/klines` 接口,从共享的 TimescaleDB(`claw.futures_<interval>` 系列 hypertables)直接读取 K 线数据供 desktop-client 和前端使用。接口 SHALL NOT 向 data-aggregator 发起任何 HTTP 调用。

#### Scenario: 查询 BTC 1h K线

- **WHEN** 调用 `GET /api/klines?symbol=BTC_USDT&interval=1h&from=2025-04-01&to=2026-04-01`
- **THEN** `backtest-engine` 通过自身 pg 连接池查询 `claw.futures_1h`
- **THEN** 返回该时间范围内的数据 `[{"ts": ..., "o": ..., "h": ..., "l": ..., "c": ..., "v": ..., "qv": ...}]`,按 `ts` 升序排列
- **THEN** 响应格式与旧版 aggregator 的 `/api/klines` 1:1 兼容,desktop-client 无需修改字段解析

#### Scenario: 非法 interval

- **WHEN** 调用 `GET /api/klines?symbol=BTC_USDT&interval=13m&from=...&to=...`
- **THEN** 返回 `400 Bad Request`,错误体包含允许的 interval 列表

### Requirement: 币种列表查询接口

`backtest-engine` SHALL 提供 `GET /api/symbols` 接口,返回 `claw.symbols` 表中当前的币种与排名信息。

#### Scenario: 查询 top 300 列表

- **WHEN** 调用 `GET /api/symbols?market=futures&limit=300`
- **THEN** 返回按 `rank` 升序的数组 `[{"symbol":"BTC_USDT","rank":1,"volume_24h_quote":5128061921,"status":"active"}]`
- **THEN** 响应格式与旧版 aggregator 的 `/api/symbols` 1:1 兼容

### Requirement: Gap 查询接口

`backtest-engine` SHALL 提供 `GET /api/gaps` 接口,读取 `claw.gaps` 表,支持按 `symbol` 和 `interval` 过滤,用于前端展示数据健康度。

#### Scenario: 查询 BTC 5m 的 gap

- **WHEN** 调用 `GET /api/gaps?symbol=BTC_USDT&interval=5m`
- **THEN** 返回该 (symbol, interval) 下的 gap 列表,字段包含 `gap_from`、`gap_to`、`missing_bars`、`status`
- **THEN** 响应格式与旧版 aggregator 的 `/api/gaps` 1:1 兼容

### Requirement: 数据网关只读

`backtest-engine` 新增的 `/api/klines`、`/api/symbols`、`/api/gaps` 接口 SHALL 为只读。SHALL NOT 对 aggregator 的写入表(symbols / klines_* / gaps)执行任何 INSERT / UPDATE / DELETE / UPSERT 操作。

#### Scenario: 只读一致性

- **WHEN** 任一网关接口被调用
- **THEN** 处理路径只执行 `SELECT` 语句
- **THEN** 若将来切换到专用 readonly DB 用户,接口 SHALL 继续工作

---

## Synced additions (2026-04-19)

### From change: `api-contract-foundation`

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

---

### From change: `api-contract-new-capabilities`

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

---

### From change: `backtest-engine-align-contract`

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

---

### From change: `backtest-engine-metadata-endpoint`

## ADDED Requirements

### Requirement: Symbol metadata 端点实现

系统 SHALL 实现 `GET /api/symbols/{symbol}/metadata` 端点,返回 `SymbolMetadata` object。字段语义:

- `symbol`: path param(大写归一化后)
- `name`: 目前 = `symbol.trim_suffix("_USDT")`(未来增强)
- `market`: 来自 `claw.symbols.market`(通常 "futures")
- `rank`: 来自 `claw.symbols.rank`(可能 null)
- `volume_24h_quote`: 来自 `claw.symbols.volume_24h_quote`(可能 null)
- `last_price`: 来自 `claw.futures_1h` 最近一行的 `close`,若 1h 无数据 fallback 到 `futures_5m`,全无则 null
- `change_24h_pct`: (last_price - close_24h_ago) / close_24h_ago × 100,若不足 24h 数据则 null
- `first_kline_at`, `last_kline_at`: 最早 / 最晚 kline 时间戳(Unix 秒)
- `status`: 来自 `claw.symbols.status`

#### Scenario: 获取 BTC_USDT metadata

- **WHEN** `GET /api/symbols/BTC_USDT/metadata`
- **THEN** 响应 200 + SymbolMetadata object
- **THEN** 所有字段填充,`change_24h_pct` 是最近 24h 内的价格变化百分比

#### Scenario: 大小写自动归一化

- **WHEN** `GET /api/symbols/btc_usdt/metadata`
- **THEN** 路径 param 转为 `BTC_USDT`
- **THEN** 按 `BTC_USDT` 查询,正常返回

#### Scenario: 路径 param 含非法字符

- **WHEN** `GET /api/symbols/BTC_USDT/../passwd/metadata`(或含特殊字符)
- **THEN** 路由层面 404(pattern 不匹配)或返回 400 + `INVALID_SYMBOL`
- **THEN** 请求 never touch DB

#### Scenario: Symbol 不存在

- **WHEN** `GET /api/symbols/DOES_NOT_EXIST/metadata`(不在 `claw.symbols` 表)
- **THEN** 响应 404 + `{ "error": { "code": "SYMBOL_NOT_FOUND", "details": { "requested": "DOES_NOT_EXIST" } } }`

#### Scenario: Symbol 已注册但无 K 线数据

- **WHEN** symbol 在 `claw.symbols` 存在但 `claw.futures_*` 表中无对应数据(新增尚未同步)
- **THEN** 响应 200 + SymbolMetadata,`last_price: null`, `change_24h_pct: null`, `first_kline_at: null`, `last_kline_at: null`
- **THEN** 其他字段(rank, volume_24h_quote, status, name, market)正常填充

#### Scenario: Symbol 数据不足 24h

- **WHEN** symbol 只有 6 小时的数据
- **THEN** `last_price` 填充,`first_kline_at / last_kline_at` 填充
- **THEN** `change_24h_pct: null`(无足够历史计算)

### Requirement: 路径 pattern 校验

`GET /api/symbols/{symbol}/metadata` 的路径 param SHALL 符合 `^[A-Z0-9_]+$`(uppercase normalize 之后)。不符合则 400 `INVALID_SYMBOL`。

#### Scenario: 含斜杠的 param

- **WHEN** 请求 path 是 `/api/symbols/BTC%2FETH/metadata`
- **THEN** 路由层面拒绝(404 或 400)
- **THEN** DB 从未被查询

---

