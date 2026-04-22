# Capability: strategy-api

Synced on 2026-04-19 from archived delta specs in `openspec/changes/archive/`.

### From change: `api-contract-new-capabilities`

## ADDED Requirements

### Requirement: Strategy CRUD 契约化

系统 SHALL 在 `api/openapi.yaml` 中以 canonical 形态定义策略 CRUD 端点,`operationId` 分别为 `createStrategy`、`listStrategies`、`getStrategy`。这些端点的后端实现由 `service-api` 提供,本 change 仅冻结契约;运行时 legacy 响应由 `cremote` adapter 归一化。

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

---

### From change: `service-api-strategy-versions`

## ADDED Requirements

### Requirement: Strategy 版本模型落地

`service-api` 的数据模型 SHALL 将策略版本拆分为独立表:

- `{{.Schema}}.strategies`:`id, name, code_type, current_version, status, is_favorite, tags, created_at, updated_at`
- `{{.Schema}}.strategy_versions`:`strategy_id, version, code, summary, params_schema, parent_version, created_at`,主键 `(strategy_id, version)`

迁移 SHALL:
- 为现有 strategies 行回填 v1(code 复制到新表,summary="Initial version")
- `strategies.current_version` 默认 1
- 迁移后从 `strategies` 表删除 `code` 和 `params_schema` 列

#### Scenario: 迁移后查 strategies

- **WHEN** 对包含 5 条现有 strategy 的 DB 运行迁移 003
- **THEN** 5 条 strategies 行不再有 `code` 列
- **THEN** `strategy_versions` 表含 5 行,每行 version=1,code 为原策略 code
- **THEN** 每条 strategies.current_version = 1

### Requirement: 列出策略版本端点

`GET /api/strategies/{id}/versions` SHALL 返回该策略的版本列表,按 `version` DESC 排序,使用 cursor 分页 `{ items, next_cursor }`。

#### Scenario: 列出有 3 个版本的策略

- **WHEN** 策略 X 有 v1, v2, v3
- **WHEN** `GET /api/strategies/<X>/versions?limit=10`
- **THEN** 响应 `{ items: [v3, v2, v1], next_cursor: null }`
- **THEN** 每个 item 含 code 全文

#### Scenario: 不存在策略

- **WHEN** `GET /api/strategies/<nonexistent>/versions`
- **THEN** 404 + `STRATEGY_NOT_FOUND`

### Requirement: 创建策略版本端点

`POST /api/strategies/{id}/versions` body `{ code, summary?, params_schema?, parent_version? }` SHALL:

1. 验证 strategy 存在
2. 验证 `parent_version`(若提供)为合法已有版本号;否则 `STRATEGY_VERSION_NOT_FOUND`
3. 在事务中 `FOR UPDATE` 锁定 strategy 行,分配 `new_version = current_version + 1`
4. 插入 `strategy_versions` 行
5. 更新 `strategies.current_version = new_version`
6. 返回新版本对象

`parent_version` 默认为当前 `current_version`(线性追加)。

#### Scenario: 普通追加新版本

- **WHEN** strategy X current_version=7,`POST /api/strategies/<X>/versions` body `{ code: "...", summary: "Tighten stop" }`
- **THEN** 数据库新增 v8,parent_version=7
- **THEN** strategies.current_version 更新为 8
- **THEN** 响应 200 + v8 对象

#### Scenario: 显式 fork

- **WHEN** body 含 `"parent_version": 3`,当前 current=7
- **THEN** 新版本 version=8(顺序),parent_version=3
- **THEN** strategies.current_version 更新为 8(线性 head)
- **THEN** 版本树中出现分叉(v3 → v4 + v3 → v8 两分支)

#### Scenario: parent_version 非法

- **WHEN** body `parent_version = 99`,实际 current=7
- **THEN** 响应 400 + `{ "error": { "code": "STRATEGY_VERSION_NOT_FOUND", "details": { "parent_version": 99, "current_version": 7 } } }`
- **THEN** 数据库无变更

#### Scenario: 并发创建版本

- **WHEN** 两个客户端几乎同时 `POST /versions`
- **THEN** 第一个获得 `FOR UPDATE` 锁,创建 v{N+1}
- **THEN** 第二个等待锁释放后,基于新的 current_version 创建 v{N+2}
- **THEN** 无版本冲突

### Requirement: 获取单个版本端点

`GET /api/strategies/{id}/versions/{version}` SHALL 返回指定版本的完整内容。

#### Scenario: 获取存在版本

- **WHEN** `GET /api/strategies/<X>/versions/3`
- **THEN** 200 + StrategyVersion 对象(含 code、summary、parent_version、created_at)

#### Scenario: 版本不存在

- **WHEN** version 超出实际范围
- **THEN** 404 + `STRATEGY_VERSION_NOT_FOUND`

### Requirement: 创建策略原子化 v1

`POST /api/strategies` SHALL 在一个事务中插入 strategies 行 + 对应的 v1 strategy_versions 行。若事务失败,整体回滚。

#### Scenario: 创建策略建立 v1

- **WHEN** `POST /api/strategies` body `{ name, code_type, code, params_schema }`
- **THEN** 新增 strategies 行,current_version=1
- **THEN** 新增 strategy_versions 行,version=1,summary="Initial version"
- **THEN** 响应 200 + `{ id, name }`(保持向后兼容,不变现有前端代码)

#### Scenario: 失败原子回滚

- **WHEN** 插入 strategy_versions 因某原因失败
- **THEN** strategies 行也不落库
- **THEN** 响应 500 + `INTERNAL_ERROR`

---

