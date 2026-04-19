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
