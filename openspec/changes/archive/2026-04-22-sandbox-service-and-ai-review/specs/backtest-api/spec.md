## MODIFIED Requirements

### Requirement: 提交回测任务 API

系统 SHALL 提供 `POST /api/backtest/start` 接口提交回测任务，响应遵循 canonical `TaskResponse` 信封形态。提交后系统 **串联执行两道 Gate**（Gate 1: AST 静态分析；Gate 2: DeepSeek AI 语义审查），两道均 approve 才把任务推送给 sandbox-service 执行。任意 Gate reject 立即拒绝请求，不创建执行记录。

#### Scenario: 提交合法单次回测

- **WHEN** 调用 `POST /api/backtest/start` 合法 body 且代码通过两道 Gate
- **THEN** 响应为 canonical TaskResponse:
  ```json
  { "task_id": "<uuid>", "status": "pending", "started_at": 1700000000 }
  ```
- **THEN** 系统依次执行 Gate 1 → Gate 2
- **THEN** 两 Gate 均 approve 后向 sandbox-service 推送任务
- **THEN** 数据库任务记录含 `gate1_verdict = approve`、`gate2_verdict = approve`
- **THEN** 没有 legacy 扁平字段

#### Scenario: Gate 1（合规）失败

- **WHEN** 代码含 `import os`
- **THEN** Gate 1 reject，系统 **不** 调用 Gate 2
- **THEN** 响应 400 + canonical error envelope:
  ```json
  {
    "error": {
      "code": "COMPLIANCE_FAILED",
      "message": "...",
      "details": { "violations": ["forbidden import: os"] }
    }
  }
  ```

#### Scenario: Gate 2（AI）拒绝

- **WHEN** 代码通过 Gate 1，但 Gate 2 DeepSeek 判定 reject（例如死循环、逃逸尝试、逻辑严重错误）
- **THEN** 响应 403 + canonical error envelope:
  ```json
  {
    "error": {
      "code": "AI_REJECTED",
      "message": "AI review rejected the code",
      "details": {
        "reason": "infinite loop without break condition",
        "dimension": "security" | "correctness",
        "model": "deepseek-reasoner"
      }
    }
  }
  ```
- **THEN** 不创建任务记录；没有 sandbox-service 推送
- **THEN** `AI_REJECTED` 是终止态——无论客户端带什么参数都无法覆盖（见 `code-review` 的 "Gate 2 reject 永不可覆盖" 需求）

#### Scenario: Gate 2 不可用（fail-closed）

- **WHEN** DeepSeek 超时 / 网络错误 / 5xx
- **THEN** 响应 503 + canonical error envelope:
  ```json
  {
    "error": {
      "code": "AI_REVIEW_UNAVAILABLE",
      "message": "AI review service is temporarily unavailable",
      "details": { "reason": "timeout after 30s" | "connection refused" | ... }
    }
  }
  ```
- **THEN** 不创建任务记录；用户可稍后重试

#### Scenario: 沙箱超时

- **WHEN** 两 Gate 通过、任务已在 sandbox-service 执行，但 worker 运行超过 30 分钟（`RLIMIT_CPU`）
- **THEN** 任务最终 `status: "failed"` + `error: { code: "SANDBOX_TIMEOUT", ... }`

#### Scenario: 沙箱服务不可用

- **WHEN** 两 Gate 通过，但 sandbox-service 容器 down 或返回 5xx
- **THEN** 任务 `status: "failed"` + `error: { code: "SANDBOX_UNAVAILABLE", message: "..." }`
- **THEN** 用户端 FriendlyError 提示 "执行服务暂不可用，请稍后重试"

### Requirement: 提交选币任务 API

系统 SHALL 提供 `POST /api/screener/start` 接口提交选币任务。提交后系统 **串联执行两道 Gate**（AST + AI），两 Gate 均 approve 才推送给 sandbox-service。任意 Gate reject 拒绝请求。

#### Scenario: 提交合法选币

- **WHEN** 调用 `POST /api/screener/start` body `{ "code": "...", "config": { "market": "futures", "lookback_days": 90 } }` 且通过两道 Gate
- **THEN** 返回 canonical `TaskResponse` `{ task_id, status: "pending", started_at }`
- **THEN** 系统先执行 Gate 1 → Gate 2，均 approve 后推送给 sandbox-service

#### Scenario: Gate 1 失败

- **WHEN** 选币代码未通过 AST 合规检查
- **THEN** 返回 HTTP 400 + canonical error envelope `{ "error": { "code": "COMPLIANCE_FAILED", "details": { "violations": [...] } } }`

#### Scenario: Gate 2 拒绝

- **WHEN** 选币代码通过 Gate 1，但被 AI 判定恶意或严重逻辑错误
- **THEN** 返回 HTTP 403 + canonical error envelope `{ "error": { "code": "AI_REJECTED", "details": { "reason": "...", "dimension": "..." } } }`

## ADDED Requirements

### Requirement: 新增错误码 AI_REJECTED 与 AI_REVIEW_UNAVAILABLE

系统 SHALL 在 `api/openapi.yaml` 的 `ErrorCode` enum 中新增两个值：`AI_REJECTED`（Gate 2 拒绝代码）和 `AI_REVIEW_UNAVAILABLE`（Gate 2 服务不可用）。两者的 HTTP 状态码固定：`AI_REJECTED` = 403、`AI_REVIEW_UNAVAILABLE` = 503。

#### Scenario: 契约声明

- **WHEN** 查看 `api/openapi.yaml`
- **THEN** `ErrorCode` enum 含 `AI_REJECTED`、`AI_REVIEW_UNAVAILABLE`
- **THEN** 两者在 `/api/backtest/start` 与 `/api/screener/start` 的 `responses` 中被列为可能的错误返回

#### Scenario: 客户端可识别

- **WHEN** 桌面客户端收到 `{ error: { code: "AI_REJECTED" } }`
- **THEN** `FriendlyError` 规则表（`desktop-client/src/services/errors/friendly.ts`）能匹配到对应的 `errors.friendly.ai_rejected.*` 翻译键
- **THEN** UI 显示友好标题（例如 "AI 审查拒绝了这段代码"）+ hint（例如 "请查看详情并修改后重试"）+ 可展开的 raw reason

### Requirement: Gate 2 审查决定不写入 backtest_runs 的成功路径

系统 SHALL 仅在两道 Gate **都** approve 之后才向 `claw.backtest_runs` / `claw.screener_runs` 插入运行记录。Gate 1 或 Gate 2 的 reject SHALL NOT 创建运行记录——它们只在审计表（`claw.ai_review_audit`）留痕。

#### Scenario: Gate 2 reject 不污染 runs

- **WHEN** 代码通过 Gate 1 但被 Gate 2 reject
- **THEN** `claw.backtest_runs` 表无新增行
- **THEN** `claw.ai_review_audit` 新增一行记录此次 reject

#### Scenario: Gate 1 reject 也不污染

- **WHEN** 代码被 Gate 1 reject
- **THEN** `claw.backtest_runs` 表无新增行
- **THEN** 仅返回错误响应，不调用 DeepSeek（节省 API 费用）
