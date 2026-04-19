## ADDED Requirements

### Requirement: 单一机器可读契约文件

仓库 SHALL 在根目录维护一份 `api/openapi.yaml`,遵循 OpenAPI 3.1 规范,作为**所有** backend-facing HTTP 接口的**唯一机器可读真源**。任何服务(`backtest-engine`、未来的 `data-aggregator` 对外接口等)暴露的 HTTP endpoint SHALL 在该文件中有对应的 operation 定义,包含完整的 request/response schema。

#### Scenario: 新增 endpoint 必须先更新契约

- **WHEN** 任一服务新增一个 HTTP endpoint(例如 `/api/analysis/optimlens`)
- **THEN** 对应的 operation 定义 SHALL 先出现在 `api/openapi.yaml` 中
- **THEN** 该 operation SHALL 有对应的 `operationId`、`summary`、至少一个 response schema、至少一个 example

#### Scenario: 契约与实现不一致时测试失败

- **WHEN** CI / pre-commit 执行 `pnpm api:lint`
- **THEN** 工具 SHALL 校验 `api/openapi.yaml` 格式合法
- **THEN** 工具 SHALL 校验 `api/examples/` 下每个 fixture 对应某个 `operationId` 且 JSON shape 匹配其 schema
- **THEN** 任一不一致导致非零退出码

### Requirement: 任务响应统一信封

对所有返回 `{ task_id, status, ... }` 形态的长任务 endpoint(例如 `/api/backtest/start`、`/api/backtest/status`、`/api/screener/start`、`/api/screener/result`,以及未来的 `/api/analysis/*`),响应 SHALL 使用统一的 `TaskResponse` schema,字段包括:

- `task_id: string (uuid)`
- `status: "pending" | "running" | "done" | "failed" | "cancelled"`
- `progress?: { phase: string, done: integer, total: integer }`
- `result?: <operation-specific>` (仅 `status === "done"` 时存在)
- `error?: ErrorBody` (仅 `status === "failed"` 时存在)
- `started_at: integer (unix seconds)`
- `finished_at?: integer (unix seconds)`

#### Scenario: 新的长任务 endpoint 使用统一信封

- **WHEN** 设计一个新的长任务 endpoint(例如 OptimLens)
- **THEN** 其 response schema 中 `allOf: [TaskResponse]` 引用该 component
- **THEN** `result` 字段由该 operation 自身 narrow

#### Scenario: 现有 endpoint 暂未对齐时,契约仍记录最终形态

- **WHEN** 现有 `/api/backtest/status/{id}` 后端响应是 legacy 形态(扁平字段,非 `TaskResponse`)
- **THEN** `openapi.yaml` SHALL 记录**最终目标**形态(即 `TaskResponse`)
- **THEN** 前端 contract-client 通过 adapter 在运行时归一化 legacy → canonical
- **THEN** `design.md` 中记录 legacy 适配的预期清理时间点

### Requirement: 错误响应统一 shape + 受控错误码字典

所有 HTTP 4xx / 5xx 响应 SHALL 返回如下 JSON 形态:

```json
{
  "error": {
    "code": "<ErrorCode enum>",
    "message": "<human readable>",
    "details": { /* optional, code-specific */ }
  }
}
```

`code` SHALL 取自 `api/openapi.yaml` 中 `ErrorCode` enum 的有限集合(初始 15 个:`INVALID_INTERVAL`、`INVALID_SYMBOL`、`INVALID_RANGE`、`SYMBOL_NOT_FOUND`、`STRATEGY_NOT_FOUND`、`BACKTEST_NOT_FOUND`、`SCREENER_NOT_FOUND`、`TASK_NOT_FOUND`、`COMPLIANCE_FAILED`、`SANDBOX_ERROR`、`SANDBOX_TIMEOUT`、`DATA_UNAVAILABLE`、`RATE_LIMITED`、`UPSTREAM_UNREACHABLE`、`INTERNAL_ERROR`)。

`api/errors.md` SHALL 对每个 code 记录:触发条件、`details` payload、前端建议的 UI 呈现方式。

#### Scenario: 前端按 code 分支渲染

- **WHEN** 后端返回 `{ "error": { "code": "INVALID_INTERVAL", "message": "...", "details": { "allowed_intervals": ["5m", "15m", "1h", "4h", "1d"] } } }`
- **THEN** 前端 SHALL 从 `details.allowed_intervals` 渲染表单选项,不需要解析 `message`
- **THEN** i18n 键 SHALL 以 code 为 key(`error.INVALID_INTERVAL`),message 仅作为 fallback

#### Scenario: 未知 code 视为 INTERNAL_ERROR

- **WHEN** 契约客户端收到一个 `code` 不在字典中的错误(例如后端未对齐前返回自由字符串)
- **THEN** adapter SHALL 归一化为 `INTERNAL_ERROR`,原始 payload 进 `details.legacy_payload`
- **THEN** 控制台记录一条 warning 提示契约漂移

### Requirement: 时间戳统一 Unix 秒

所有 wire format 中的时间字段(包括但不限于 `ts`、`started_at`、`finished_at`、`from`、`to`、`entry_time`、`exit_time`、`updated_at`、`created_at`) SHALL 是 Unix 秒(integer)。不使用 milliseconds,不使用 ISO 8601 字符串,不使用 `YYYY-MM-DD`。

#### Scenario: 契约校验拒绝 ISO 字符串

- **WHEN** 某 operation 的 schema 中时间字段声明为 `type: string, format: date-time`
- **THEN** `pnpm api:lint` 在自定义 linter 规则下报错,要求改为 `type: integer`

#### Scenario: 旧 endpoint 接受 ISO 的行为作为 deprecated 记录

- **WHEN** 现有 `/api/klines` 后端同时接受 `from=1700000000` 和 `from=2025-04-01`
- **THEN** `openapi.yaml` 仅声明 integer 形态作为契约
- **THEN** `design.md` 或 `errors.md` 注明旧形态 deprecated,未来 backend-align PR 移除

### Requirement: 列表分页使用 cursor

所有返回可能超过 500 条的列表 endpoint SHALL 支持 `?cursor=<opaque>&limit=<n>` 分页。响应 SHALL 包含 `next_cursor: string | null`。`limit` 默认 100,最大 500。SHALL NOT 使用 offset / page-number 分页。

#### Scenario: 初始请求不带 cursor

- **WHEN** `GET /api/strategies?limit=50`(或 `/api/symbols?limit=50`)
- **THEN** 返回前 50 条 + `next_cursor: "<opaque>"` 或 `null`(若总数 ≤ 50)

#### Scenario: 后续请求带 cursor

- **WHEN** `GET /api/strategies?cursor=<opaque>&limit=50`
- **THEN** 返回 cursor 位置之后的 50 条 + 更新 `next_cursor`

### Requirement: TypeScript 类型自动生成并提交

`desktop-client/src/types/api.d.ts` SHALL 由 `pnpm api:types` 从 `api/openapi.yaml` 通过 `openapi-typescript` 自动生成。生成结果 SHALL 被提交到版本控制。CI(或本地等价的 `make test` / pre-commit) SHALL 运行生成器并在 diff 非空时失败。

#### Scenario: 修改 openapi.yaml 必须同步 types

- **WHEN** 开发者编辑 `api/openapi.yaml` 但没重跑 `pnpm api:types`
- **THEN** CI 脚本运行 `pnpm api:types` 后 git diff 非空
- **THEN** CI 失败,错误信息提示 "run `pnpm api:types` and commit the regenerated types"

### Requirement: MSW 提供前端离线 mock

`desktop-client/src/mocks/` SHALL 提供 MSW(Mock Service Worker)handler 集合,覆盖 `api/openapi.yaml` 中每一个 operation。Handler SHALL 由 `desktop-client/scripts/gen-msw-handlers.ts` 从 `api/openapi.yaml` + `api/examples/*.json` 生成。

Mock SHALL 支持三种 profile,由 `CLAW_MOCK_PROFILE` env 控制:

- `happy`(默认):每个请求返回对应 example,200 OK
- `slow`:相同响应 + 500–1500ms 随机延迟
- `chaos`:15% 请求随机返回 4xx/5xx 错误(从 `ErrorCode` 字典中均匀抽)

#### Scenario: dev 模式下用 mock 跑前端

- **WHEN** 开发者运行 `pnpm dev:mock`(或者 `VITE_USE_MOCKS=1 pnpm dev`)
- **THEN** Vite dev server + Electron 启动
- **THEN** 渲染进程 fetch `/api/*` 被 MSW 拦截,返回 `api/examples/` 的 fixtures
- **THEN** 不需要任何真实 backtest-engine / Timescale 运行

#### Scenario: Vitest 默认启用 MSW Node server

- **WHEN** 任一 vitest 测试 import 后调用 `fetch('/api/klines?...')`
- **THEN** 请求被 MSW node server 拦截,返回 fixtures
- **THEN** 测试可重复、离线、无 flake

### Requirement: 契约客户端包装层,不替换现有 client

`desktop-client/src/services/remote/contract-client.ts` 中 export 的 `cremote` 对象 SHALL 提供按 `operationId` 命名的强类型方法(例如 `cremote.getKlines({ symbol, interval, from, to })`),方法签名 SHALL 从 `src/types/api.d.ts` 派生。现有 `remote` 导出 SHALL 保持不变以保证老代码仍可运行;contract-client 是**增量迁移**路径。

#### Scenario: 新 UI 代码使用 cremote

- **WHEN** 新页面(例如未来的 Workspace)调用 `cremote.startBacktest({ ... })`
- **THEN** TypeScript 参数和返回值类型完全由 openapi 生成的类型确定
- **THEN** 在 dev/test 模式下,返回值会被运行时 schema validator 检查;mismatch 打 warning 不 throw

#### Scenario: 旧代码继续用 remote

- **WHEN** 现有 `ScreenerPage` / `BacktestPage` 等老代码仍使用 `remote.startScreener(...)`
- **THEN** 行为不变,tests 仍通过
- **THEN** 迁移到 `cremote` 属于各自 UI 重构 change 的范围,非本 change 责任

#### Scenario: contract-client 适配 legacy 响应形态

- **WHEN** 后端尚未按 canonical `TaskResponse` 返回(例如 `/api/backtest/status` 仍返回扁平 shape)
- **THEN** `cremote` 内部 adapter SHALL 将 legacy shape 归一化为 `TaskResponse`
- **THEN** 归一化失败时 fallback 为 `INTERNAL_ERROR` + warning log
