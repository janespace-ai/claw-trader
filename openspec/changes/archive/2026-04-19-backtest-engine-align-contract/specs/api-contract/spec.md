## MODIFIED Requirements

### Requirement: 任务响应统一信封

所有返回 `{ task_id, status, ... }` 形态的长任务 endpoint(例如 `/api/backtest/start`、`/api/backtest/status`、`/api/screener/start`、`/api/screener/result`,以及未来的 `/api/analysis/*`),响应 SHALL 使用统一的 `TaskResponse` schema,并且 **后端运行时 SHALL 真实返回该形态**,不再依赖前端 adapter 归一化。

#### Scenario: backend 真实返回 canonical TaskResponse

- **WHEN** 对后端任一 task 端点发起请求
- **THEN** 响应 body 直接匹配 `TaskResponse` schema
- **THEN** 前端不需要 legacy-adapter 即可消费
- **THEN** `desktop-client/src/services/remote/legacy-adapter.ts` 可以安全删除(本 change 的一部分)

#### Scenario: 现有 legacy 输出完全退役

- **WHEN** 扫描 backtest-engine 代码
- **THEN** 无 handler 生成 legacy 扁平形态(`s3_progress`、`api_progress` 作为 root 字段等)
- **THEN** 所有 task 响应走统一 `RespondTask` helper

### Requirement: 错误响应统一 shape + 受控错误码字典

所有 HTTP 4xx / 5xx 响应 SHALL 使用 canonical `{ error: { code, message, details? } }` envelope,`code` 取自 15 个预定义 ErrorCode。后端 SHALL 真实生成此形态,不再返回 `{"error": "some string"}` legacy。

#### Scenario: 所有 handler 使用受控 code

- **WHEN** 审计 backtest-engine 所有 handler 的错误路径
- **THEN** 每个错误路径映射到 `errors/errors.go` 中的一个 Code 常量
- **THEN** 未分类错误默认映射到 `INTERNAL_ERROR`
- **THEN** 前端 `cremote` 接到的错误体直接是 canonical,无需 adapter 做 legacy 解码

### Requirement: Unix 秒时间戳在后端输出中落地

后端响应所有时间字段 SHALL 输出为 integer(Unix 秒)。输入 query 参数暂接受 legacy `YYYY-MM-DD` 形态但 SHALL 在响应中加 `Warning: 299` deprecation header。

#### Scenario: 后端不再输出 ISO / RFC3339 字符串

- **WHEN** 任一 JSON 响应序列化
- **THEN** 所有 *_at、ts、started_at、finished_at 等字段为 integer
- **THEN** `json:",string"` 或 time.Time-marshalling 等 ISO 输出路径被移除
