## ADDED Requirements

### Requirement: Strategy CRUD 契约化

系统 SHALL 在 `api/openapi.yaml` 中以 canonical 形态定义策略 CRUD 端点,`operationId` 分别为 `createStrategy`、`listStrategies`、`getStrategy`。这些端点的后端实现由 `backtest-engine` 提供,本 change 仅冻结契约;运行时 legacy 响应由 `cremote` adapter 归一化。

`Strategy` schema SHALL 包含:`id: string (uuid)`、`name: string`、`code_type: "strategy" | "screener"`、`code: string`、`params_schema?: object`、`current_version: integer`、`created_at: integer (unix s)`、`updated_at: integer (unix s)`。

#### Scenario: 列表使用 cursor 分页

- **WHEN** `GET /api/strategies?limit=50&cursor=<opaque>`
- **THEN** 响应 body shape: `{ "items": Strategy[], "next_cursor": string | null }`
- **THEN** `items.length ≤ 50`,`next_cursor` 为 null 表示已到末尾

#### Scenario: 获取单个策略

- **WHEN** `GET /api/strategies/{id}`
- **THEN** 返回 200 + `Strategy` object;`current_version` 字段指向最新版本号
- **WHEN** id 不存在
- **THEN** 返回 404 + `{ "error": { "code": "STRATEGY_NOT_FOUND", ... } }`

### Requirement: 策略版本列表端点

系统 SHALL 提供 `GET /api/strategies/{id}/versions` 接口,返回该策略的所有历史版本,按 `version` 降序(最新在前)。使用 cursor 分页。

响应 item shape:`{ strategy_id, version: integer, code: string, summary: string, params_schema?: object, parent_version: integer | null, created_at: integer (unix s) }`。

#### Scenario: 列出版本

- **WHEN** `GET /api/strategies/<id>/versions?limit=20`
- **THEN** 返回 `{ "items": StrategyVersion[], "next_cursor": string | null }`
- **THEN** 版本按 `version` DESC 排列
- **THEN** 每个版本包含 code 全文 —— 前端 diff 视图在 renderer 里计算

#### Scenario: 策略不存在

- **WHEN** id 不存在
- **THEN** 返回 404 + `STRATEGY_NOT_FOUND`

### Requirement: 创建策略版本端点

系统 SHALL 提供 `POST /api/strategies/{id}/versions` 接口,为已有策略追加新版本。服务端自动分配 `version`(当前最大版本 + 1),`parent_version` 默认为当前 `current_version`,也可由 caller 显式覆盖(用于 fork 场景)。

#### Scenario: 创建下一个版本

- **WHEN** `POST /api/strategies/<id>/versions`,body `{ "code": "...", "summary": "Tightened stop loss" }`
- **THEN** 服务端分配 `version = current_version + 1`,`parent_version = old current_version`
- **THEN** 策略的 `current_version` 更新为新值
- **THEN** 返回 200 + 新版本对象

#### Scenario: 显式 fork

- **WHEN** body 额外包含 `"parent_version": 3`,而 `current_version = 7`
- **THEN** 服务端仍分配 `version = 8`(顺序递增)
- **THEN** 但 `parent_version = 3`(非线性历史)
- **THEN** Strategy Management UI 的版本树因此显示分叉

#### Scenario: 非法 parent_version

- **WHEN** body 指定 `parent_version = 99` 但实际上该策略只有 7 个版本
- **THEN** 返回 400 + `{ "error": { "code": "STRATEGY_VERSION_NOT_FOUND", "message": "parent_version 99 does not exist for this strategy" } }`

### Requirement: 获取单个策略版本

系统 SHALL 提供 `GET /api/strategies/{id}/versions/{version}` 接口,返回该策略的指定版本快照。

#### Scenario: 获取已存在版本

- **WHEN** `GET /api/strategies/<id>/versions/3`
- **THEN** 返回 200 + 该版本对象(code、summary、timestamps 等)

#### Scenario: 版本不存在

- **WHEN** 版本号超出已有范围
- **THEN** 返回 404 + `STRATEGY_VERSION_NOT_FOUND`
