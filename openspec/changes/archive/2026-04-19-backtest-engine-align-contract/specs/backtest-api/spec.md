## MODIFIED Requirements

### Requirement: 提交回测任务 API

系统 SHALL 提供 `POST /api/backtest/start` 接口提交回测任务,响应遵循 canonical `TaskResponse` 信封形态(见 `api-contract` 能力)。任务 ID、状态、开始时间等字段使用 Unix 秒(integer)。

#### Scenario: 提交单次回测

- **WHEN** 调用 `POST /api/backtest/start` 合法 body
- **THEN** 响应为 canonical TaskResponse:
  ```json
  {
    "task_id": "<uuid>",
    "status": "pending",
    "started_at": 1700000000
  }
  ```
- **THEN** 系统执行合规检查 + 启动沙箱
- **THEN** 没有 legacy 扁平字段(如直接在根的 `mode`、`s3_progress` 等)

#### Scenario: 合规失败

- **WHEN** 代码含 `import os`
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

#### Scenario: 沙箱超时

- **WHEN** 沙箱运行超时
- **THEN** 任务最终 `status: "failed"` + `error: { code: "SANDBOX_TIMEOUT", ... }`

### Requirement: 回测状态与结果 API

`GET /api/backtest/status/{task_id}` 与 `GET /api/backtest/result/{task_id}` SHALL 返回 canonical `TaskResponse` 形态,`result` 字段(仅 status=done 时)包含回测领域特定 schema。时间字段全部 Unix 秒。

#### Scenario: status 端点返回 canonical 信封

- **WHEN** 任务 running,调用 `GET /api/backtest/status/{task_id}`
- **THEN** 响应:
  ```json
  {
    "task_id": "...",
    "status": "running",
    "progress": { "phase": "sandbox", "done": 50, "total": 100 },
    "started_at": 1700000000
  }
  ```
- **THEN** `result` 字段不存在,`error` 字段不存在

#### Scenario: result 端点返回完整结果

- **WHEN** 任务 done
- **THEN** `status: "done"` + `result: BacktestResult` + `finished_at: <ts>`
- **THEN** `BacktestResult` 的所有时间字段为 Unix 秒

### Requirement: 回测历史 API 使用 cursor 分页

`GET /api/backtest/history` SHALL 返回 cursor-分页形态 `{ items: BacktestHistoryItem[], next_cursor: string | null }`。接受 `?limit=<n>` + `?cursor=<opaque>`。不再返回裸数组。

#### Scenario: 分页列出历史

- **WHEN** 调用 `GET /api/backtest/history?limit=20`
- **THEN** 响应含 `items`(≤20 条)+ `next_cursor`
- **THEN** 下一页用 `GET /api/backtest/history?cursor=<opaque>&limit=20`

### Requirement: 删除 legacy 响应形态支持

`backtest-api` 的所有 handler SHALL 不再生成 legacy 扁平形态。`desktop-client/src/services/remote/legacy-adapter.ts` 中对应的适配函数 SHALL 被删除。

#### Scenario: 适配器被移除后 cremote 正常工作

- **WHEN** 从 UI 任意屏幕调用 `cremote.startBacktest(...)`
- **THEN** 请求直接打到新 handler,响应直接使用(无适配)
- **THEN** 类型检查通过(`src/types/api.d.ts` 匹配真实后端输出)
