# backtest-api Specification

## Purpose

TBD — created by archiving change backtest-engine. Update Purpose after archive.

## Requirements

### Requirement: 提交回测任务 API

系统 SHALL 提供 `POST /api/backtest/start` 接口提交回测任务。任务在后台沙箱中执行，接口立即返回 task_id。

#### Scenario: 提交单次回测

- **WHEN** 调用 `POST /api/backtest/start` body:
  ```json
  {
    "code": "class MyStrategy(Strategy): ...",
    "config": {
      "symbols": ["BTC_USDT"],
      "interval": "1h",
      "from": "2025-04-01",
      "to": "2026-04-01",
      "initial_capital": 10000,
      "commission": 0.0006,
      "slippage": 0.0001
    }
  }
  ```
- **THEN** 返回 `{"task_id": "uuid", "status": "pending"}`
- **THEN** 系统先执行代码合规检查
- **THEN** 通过后创建沙箱容器执行回测

#### Scenario: 提交参数优化回测

- **WHEN** 提交的策略代码中声明了 `params` 字段
- **THEN** 系统识别为参数优化模式
- **THEN** 返回 `{"task_id": "uuid", "status": "pending", "mode": "optimization"}`

#### Scenario: 代码合规检查失败

- **WHEN** 提交的代码未通过合规检查
- **THEN** 返回 HTTP 400：`{"error": "compliance_failed", "details": "forbidden import: os"}`
- **THEN** 不创建任务记录

#### Scenario: 已有任务运行中

- **WHEN** 已有一个回测任务处于 running 状态时提交新任务
- **THEN** 返回 HTTP 409：`{"error": "task_running", "running_task_id": "uuid"}`

### Requirement: 查询回测进度 API

系统 SHALL 提供 `GET /api/backtest/status/:task_id` 接口查询回测任务进度。

#### Scenario: 查询运行中的任务

- **WHEN** 调用 `GET /api/backtest/status/{task_id}` 且任务正在执行
- **THEN** 返回：
  ```json
  {
    "task_id": "uuid",
    "status": "running",
    "mode": "single",
    "progress": {"phase": "backtesting", "current_bar": 5000, "total_bars": 10000},
    "started_at": "2026-04-16T10:00:00Z"
  }
  ```

#### Scenario: 查询参数优化进度

- **WHEN** 查询参数优化任务的进度
- **THEN** 返回：
  ```json
  {
    "task_id": "uuid",
    "status": "running",
    "mode": "optimization",
    "progress": {"current_run": 5, "total_runs": 9, "phase": "backtesting"},
    "started_at": "2026-04-16T10:00:00Z"
  }
  ```

#### Scenario: 查询不存在的任务

- **WHEN** 调用 `GET /api/backtest/status/{task_id}` 且 task_id 不存在
- **THEN** 返回 HTTP 404：`{"error": "task_not_found"}`

### Requirement: 获取回测结果 API

系统 SHALL 提供 `GET /api/backtest/result/:task_id` 接口获取回测结果。

#### Scenario: 获取已完成任务结果

- **WHEN** 调用 `GET /api/backtest/result/{task_id}` 且任务已完成
- **THEN** 返回完整回测结果，包含：
  - `metrics`: 所有指标（ALL/LONG/SHORT 三维度）
  - `equity_curve`: 权益曲线时间序列
  - `drawdown_curve`: 回撤曲线时间序列
  - `monthly_returns`: 月度收益数据
  - `trades`: 完整交易列表
  - `config`: 回测配置
  - `optimization_results`: 参数优化结果（仅优化模式）

#### Scenario: 获取失败任务结果

- **WHEN** 调用 `GET /api/backtest/result/{task_id}` 且任务已失败
- **THEN** 返回 `{"task_id": "...", "status": "failed", "error": "错误信息", "traceback": "..."}`

#### Scenario: 获取未完成任务结果

- **WHEN** 调用 `GET /api/backtest/result/{task_id}` 且任务仍在运行
- **THEN** 返回 HTTP 202：`{"task_id": "...", "status": "running", "message": "task still in progress"}`

### Requirement: 提交选币任务 API

系统 SHALL 提供 `POST /api/screener/start` 接口提交选币任务。

#### Scenario: 提交选币任务

- **WHEN** 调用 `POST /api/screener/start` body:
  ```json
  {
    "code": "class MyScreener(Screener): ...",
    "config": {
      "market": "futures",
      "lookback_days": 90
    }
  }
  ```
- **THEN** 返回 `{"task_id": "uuid", "status": "pending"}`
- **THEN** 系统对代码执行合规检查后在沙箱中运行

#### Scenario: 选币代码合规检查失败

- **WHEN** 选币代码未通过合规检查
- **THEN** 返回 HTTP 400：`{"error": "compliance_failed", "details": "..."}`

### Requirement: 获取选币结果 API

系统 SHALL 提供 `GET /api/screener/result/:task_id` 接口获取选币结果。

#### Scenario: 获取选币结果

- **WHEN** 调用 `GET /api/screener/result/{task_id}` 且任务已完成
- **THEN** 返回：
  ```json
  {
    "task_id": "uuid",
    "status": "done",
    "total_symbols": 300,
    "passed": 45,
    "results": [
      {"symbol": "BTC_USDT", "passed": true, "score": 0.95},
      {"symbol": "ETH_USDT", "passed": true, "score": 0.87}
    ]
  }
  ```

### Requirement: 策略代码管理 API

系统 SHALL 提供策略代码的 CRUD 接口，支持保存和复用策略。

#### Scenario: 保存策略代码

- **WHEN** 调用 `POST /api/strategies` body:
  ```json
  {
    "name": "SMA Crossover",
    "code_type": "strategy",
    "code": "class MyStrategy(Strategy): ..."
  }
  ```
- **THEN** 返回 `{"id": "uuid", "name": "SMA Crossover", "created_at": "..."}`

#### Scenario: 查询策略列表

- **WHEN** 调用 `GET /api/strategies`
- **THEN** 返回所有已保存策略列表，按 created_at 降序

#### Scenario: 查询历史回测列表

- **WHEN** 调用 `GET /api/backtest/history?strategy_id={id}&limit=20`
- **THEN** 返回该策略的历史回测记录列表（含摘要指标）

### Requirement: 内部 Callback Endpoint

系统 SHALL 提供内部 HTTP endpoint 供沙箱容器回调报告进度和结果。这些 endpoint 不对外暴露。

#### Scenario: 接收进度回调

- **WHEN** 沙箱容器调用 `POST /internal/cb/progress`
- **THEN** 系统更新任务的 progress 字段

#### Scenario: 接收完成回调

- **WHEN** 沙箱容器调用 `POST /internal/cb/complete`
- **THEN** 系统将任务状态更新为 `done`
- **THEN** 存储回测结果到数据库
- **THEN** 触发容器清理

#### Scenario: 接收错误回调

- **WHEN** 沙箱容器调用 `POST /internal/cb/error`
- **THEN** 系统将任务状态更新为 `failed`
- **THEN** 存储错误信息
- **THEN** 触发容器清理
