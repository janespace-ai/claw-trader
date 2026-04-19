# test-infrastructure Specification

## Purpose

Defines the repo-wide test conventions, shared utilities, and entry points that make it possible to add tests across `data-aggregator`, `backtest-engine`, the Python sandbox framework, and `desktop-client` without each suite inventing its own plumbing. Introduced by the `add-test-infrastructure` change.

## Requirements

### Requirement: 单入口 test 命令

仓库 SHALL 在根目录提供 `Makefile`,使开发者能以**一条命令**运行整个代码仓的测试。`make test` SHALL 依次调起 Go 测试、Python 测试、TypeScript 测试,并 SHALL 在任一子套件失败时整体返回非零退出码。E2E 烟雾测试 SHALL NOT 自动包含在 `make test` 内,仅在显式调用 `make test-e2e` 时运行。

#### Scenario: 干净仓库运行 make test

- **WHEN** 开发者在仓库根目录执行 `make test`,且 `localhost:5432` 上的 Timescale 已由 `make db-up` 启动
- **THEN** Make 依次运行 `test-aggregator`、`test-backtest`、`test-sandbox`、`test-desktop` 子目标
- **THEN** 所有子目标退出码为 0 时,`make test` 退出 0
- **THEN** 任一子目标失败时,`make test` 立即终止并返回非零退出码

#### Scenario: 未启动 Timescale 的清晰错误

- **WHEN** 开发者执行 `make test` 但未先执行 `make db-up`,Timescale 不可达
- **THEN** DB 相关测试输出清晰的跳过或失败信息,包含提示 "run `make db-up` first" 或等效指引
- **THEN** 纯单元测试(不触 DB)仍正常运行通过

### Requirement: DB 测试使用一次性 schema 隔离

所有 touch 真实 Timescale 的 Go 测试 SHALL 通过共享的 `testdb` 辅助包创建一次性 schema。每个调用 `testdb.New(t)` 的测试 SHALL 获得独立的 `test_<uuid>` schema,该 schema SHALL 在测试结束时通过 `t.Cleanup` 被 `DROP SCHEMA ... CASCADE`。测试 SHALL NOT 触及生产 `claw` schema。

#### Scenario: 并发测试互不干扰

- **WHEN** 两个测试在同一 package 内并发运行,均调用 `testdb.New(t)`
- **THEN** 两个测试获得互不相同的 schema(例如 `test_a1b2c3d4` 和 `test_e5f6g7h8`)
- **THEN** 一方的写入 SHALL NOT 影响另一方
- **THEN** 两个测试结束后,两个 schema 均被清理,生产 `claw` schema 不受影响

#### Scenario: 测试进程崩溃时也要能清理

- **WHEN** 测试进程因 panic 或 `kill -9` 中途终止,留下遗弃 schema
- **THEN** `testdb` 包 SHALL 提供 `Reap(maxAge time.Duration)` 辅助,可由 `make db-up` 或独立目标 `make db-reap` 调用,删除超过指定时长的 `test_*` schema
- **THEN** 默认清理阈值 SHALL 为 1 小时

### Requirement: 数据库迁移支持注入 schema 名

两个 Go 服务(`data-aggregator`、`backtest-engine`)的迁移 SHALL 支持在运行时指定目标 schema 名,而不只是硬编码 `claw`。迁移 SQL 文件 SHALL 使用 `{{.Schema}}` 占位符替代裸 `claw.` 表前缀;迁移执行器 SHALL 在应用前通过 `text/template` 渲染占位符。

#### Scenario: 生产环境迁移行为不变

- **WHEN** 生产环境以 `Schema = "claw"` 调用 `store.Migrate(ctx)`
- **THEN** 渲染后的 SQL 与原始硬编码版本逐字节一致
- **THEN** 已存在的 `claw.*` 表、索引、hypertable 不受影响

#### Scenario: 测试环境迁移指向隔离 schema

- **WHEN** 测试代码以 `Schema = "test_abc123"` 调用同一迁移函数
- **THEN** 所有 `claw.` 前缀被渲染为 `test_abc123.`
- **THEN** 迁移完成后,`test_abc123.futures_5m` 等表存在;`claw.*` 不受影响

### Requirement: 外部 API 调用仅由本地金样本提供服务

所有测试 SHALL NOT 发起对 Gate.io(`api.gateio.ws` 或 `gateio-public-data.s3...`)的真实 HTTP 请求。每项涉及 Gate.io 的测试 SHALL 通过 `httptest.Server` + 仓库内的 `testdata/gateio/` 金样本文件返回固定响应。

#### Scenario: 离线测试必须全部通过

- **WHEN** 测试环境断网(例如 CI 或飞机上)
- **THEN** `make test` 的所有 Go / Python / TS 子目标 SHALL 全部通过,无网络错误

#### Scenario: 金样本覆盖关键响应形态

- **WHEN** 查看 `data-aggregator/internal/testfixtures/testdata/gateio/`
- **THEN** 目录下 SHALL 至少包含:
  - tickers 响应(1 个 JSON,至少 3 个合约)
  - candles 响应(1 个 JSON,包含可空的 `sum` 字段以测试 quote_volume 处理)
  - S3 CSV gzip 示例(通过 `testfixtures.S3Fixture` 在测试内声明的若干月份;服务器会返回 404 标识未注册的 symbol/month 组合)

### Requirement: Pipeline 幂等性 flagship 测试

`data-aggregator` SHALL 包含一个 end-to-end-style Go 测试,验证 `SyncService.RunBoot` 在相同数据状态下**重复运行**不重复下载。该测试 SHALL 使用 Gate.io 金样本服务器、`testdb` 的隔离 schema,并 SHALL 作为 `make test-aggregator` 的一部分运行。

#### Scenario: 第一次 boot 下载缺失月份

- **WHEN** 测试 schema 中 `sync_state` 已标记 N-2 月份为 `done`,但 N-1 月份未登记
- **WHEN** 运行 `SyncService` 的同步版 `RunBootSync(ctx)`
- **THEN** S3 fetcher 的 progress.Total 恰好等于 1(仅 N-1 月份)
- **THEN** progress.Done 等于 1,progress.Failed 等于 0
- **THEN** 对应月份的 BTC_USDT 行数 > 0

#### Scenario: 第二次 boot 无额外下载

- **WHEN** 紧接着再次运行 `RunBootSync(ctx)`
- **THEN** S3 fetcher 的 progress.Total 等于 0
- **THEN** DB 行数相对第一次运行后保持稳定(upsert 契约)

### Requirement: 共享 schema 契约测试

`backtest-engine` SHALL 包含一个契约测试,保证其 data-gateway 查询(`QueryKlines`、`ListActiveSymbols`、`QueryGaps`)的 SELECT 列名与 `data-aggregator` 当前迁移产生的表结构一致。迁移 SQL 文件 SHALL 由 `make sync-aggregator-migrations` 从 `data-aggregator/internal/store/migrations/` 复制到 `backtest-engine/internal/testdb/testdata/aggregator-migrations/`,测试 SHALL 首先校验该副本的校验和以防止漂移。

#### Scenario: aggregator 迁移改动后 backtest-engine 测试失败

- **WHEN** `data-aggregator` 的某迁移 SQL 文件被修改或新增
- **WHEN** 开发者未运行 `make sync-aggregator-migrations` 就提交
- **THEN** `make test-backtest` 的契约测试 FAILS,错误信息明确提示运行 `make sync-aggregator-migrations`
- **THEN** 失败在任何实际 DB 查询之前发生

#### Scenario: 正常运行校验所有 gateway 查询

- **WHEN** 迁移副本校验和匹配
- **WHEN** 测试对 `test_*` schema apply aggregator 迁移,然后逐个调用三个 gateway 查询
- **THEN** 每个查询返回无错(即使返回零行)
- **THEN** 查询返回的列类型与 handler 的 struct tag 声明兼容

### Requirement: Python sandbox 合规检查测试

`backtest-engine/sandbox/tests/` SHALL 存在 pytest 测试套件,覆盖:
- 每一条 `config.yaml` 中列出的 `forbidden_builtins`(如 `exec`、`eval`、`__import__`)的 AST 检查器 SHALL 拒绝
- 每一条 `forbidden_modules`(如 `os`、`subprocess`、`socket`)的 import SHALL 被拒绝
- `module_whitelist` 中的合法 import 至少一项 SHALL 通过
- `metrics.py` 对固定 10-bar 策略的 Sharpe / max-drawdown / win-rate 计算 SHALL 与 `testdata/golden_metrics.json` 逐字段精确匹配

#### Scenario: 禁用 builtin 被拒绝

- **WHEN** 测试将含有 `exec("1+1")` 的代码片段传给 compliance 检查器
- **THEN** 检查器返回非空违规列表,违规条目包含 `"exec"`

#### Scenario: 白名单模块通过

- **WHEN** 测试将含有 `import numpy as np` 的代码片段传给检查器
- **THEN** 检查器返回零违规

#### Scenario: Metrics 计算与 golden 匹配

- **WHEN** 对固定种子构造的 10 根 K 线策略计算 Sharpe、max-drawdown、win-rate
- **THEN** 三个数值 SHALL 与 `testdata/golden_metrics.json` 中的值在浮点容差(1e-9 绝对或 1e-6 相对)内匹配

### Requirement: Desktop-client Vitest 测试套件

`desktop-client` SHALL 包含由 Vitest 驱动的 TypeScript 测试,由 `make test-desktop` 调起 `pnpm test`(或等效 `npx vitest run`)运行。最小 pilot 覆盖 SHALL 包含:
- `settingsStore` 的主要状态转移
- `pollBacktestResult` 的 done / failed / abort 路径
- 自定义 ESLint 规则 `claw/no-hex-color` 和 `claw/no-raw-jsx-string` 的正反用例(通过 ESLint 官方 `RuleTester`)

#### Scenario: settingsStore 加载持久值

- **WHEN** 测试注入 fake `window.claw.db.settings`,返回 `{ 'remote.baseURL': 'http://foo:9000' }`
- **WHEN** 调用 `useSettingsStore.getState().load()`
- **THEN** `remoteBaseURL` 字段等于 `'http://foo:9000'`

#### Scenario: pollBacktestResult 在 status=done 时解析

- **WHEN** fake status 函数前 2 次返回 `{ status: 'running' }`,第 3 次返回 `{ status: 'done' }`
- **WHEN** 调用 `pollBacktestResult(taskId, onProgress, { intervalMs: 1 })`
- **THEN** `onProgress` 被调用至少 3 次
- **THEN** 返回值为对应的 `backtestResult` 输出

#### Scenario: ESLint 规则拒绝硬编码 hex

- **WHEN** `RuleTester` 对 `<div style={{ color: '#ff0000' }} />` 应用 `no-hex-color` 规则
- **THEN** 规则报告恰好 1 个错误
- **THEN** 错误消息包含 "var(" 提示

### Requirement: Docker E2E 烟雾测试

仓库 SHALL 在 `e2e/` 目录下提供一个 shell 脚本 `run.sh`,`make test-e2e` SHALL 调用它。脚本 SHALL 启动完整 docker-compose 栈(Timescale + aggregator + backtest-engine),使用 `config.test.yaml` 的小规模配置,验证从空 DB 到 `/api/klines` 返回数据的黄金链路,然后 clean teardown。

#### Scenario: 冷启动 E2E 成功

- **WHEN** 执行 `make test-e2e` 时,Docker daemon 运行但 `claw-*` 容器未启动
- **THEN** 脚本 `docker compose up -d --build` 起栈,等待 aggregator 日志出现 `[sync] task ... finished status=done`(超时 300 秒)
- **THEN** `curl http://localhost:8081/api/symbols?limit=2` 返回 HTTP 200,JSON 数组长度等于 2
- **THEN** `curl http://localhost:8081/api/klines?symbol=<seeded>&interval=1h&from=<7d>&to=<now>` 返回 HTTP 200,JSON 数组非空
- **THEN** 脚本 `docker compose down -v` 清理所有容器和卷
- **THEN** 脚本整体退出 0

#### Scenario: aggregator 启动失败时清理仍运行

- **WHEN** aggregator 容器启动失败(例如端口占用)
- **THEN** 脚本打印诊断日志
- **THEN** `trap` 处理器仍执行 `docker compose down -v`
- **THEN** 脚本退出非零

### Requirement: TESTING.md 使用指南

仓库根目录 SHALL 存在 `TESTING.md`,内容 SHALL 包含:首次设置步骤、`make` 目标速查表、各服务添加测试的模板示例、`testdb` 辅助用法、如何刷新 Gate.io 金样本、如何启用可选 pre-commit hook。

#### Scenario: 新成员按 TESTING.md 上手

- **WHEN** 新加入的开发者按 `TESTING.md` 步骤 1-3 操作(启动 Timescale、运行 `make test`、写一个新测试)
- **THEN** 每一步都有可复制的命令
- **THEN** 写新测试的示例覆盖"纯单元"、"需要 DB"、"需要 HTTP handler"三种典型场景

---

## Synced additions (2026-04-19)

### From change: `add-test-infrastructure`

## ADDED Requirements

### Requirement: 单入口 test 命令

仓库 SHALL 在根目录提供 `Makefile`,使开发者能以**一条命令**运行整个代码仓的测试。`make test` SHALL 依次调起 Go 测试、Python 测试、TypeScript 测试,并 SHALL 在任一子套件失败时整体返回非零退出码。E2E 烟雾测试 SHALL NOT 自动包含在 `make test` 内,仅在显式调用 `make test-e2e` 时运行。

#### Scenario: 干净仓库运行 make test

- **WHEN** 开发者在仓库根目录执行 `make test`,且 `localhost:5432` 上的 Timescale 已由 `make db-up` 启动
- **THEN** Make 依次运行 `test-aggregator`、`test-backtest`、`test-sandbox`、`test-desktop` 子目标
- **THEN** 所有子目标退出码为 0 时,`make test` 退出 0
- **THEN** 任一子目标失败时,`make test` 立即终止并返回非零退出码

#### Scenario: 未启动 Timescale 的清晰错误

- **WHEN** 开发者执行 `make test` 但未先执行 `make db-up`,Timescale 不可达
- **THEN** DB 相关测试输出清晰的跳过或失败信息,包含提示 "run `make db-up` first" 或等效指引
- **THEN** 纯单元测试(不触 DB)仍正常运行通过

### Requirement: DB 测试使用一次性 schema 隔离

所有 touch 真实 Timescale 的 Go 测试 SHALL 通过共享的 `testdb` 辅助包创建一次性 schema。每个调用 `testdb.New(t)` 的测试 SHALL 获得独立的 `test_<uuid>` schema,该 schema SHALL 在测试结束时通过 `t.Cleanup` 被 `DROP SCHEMA ... CASCADE`。测试 SHALL NOT 触及生产 `claw` schema。

#### Scenario: 并发测试互不干扰

- **WHEN** 两个测试在同一 package 内并发运行,均调用 `testdb.New(t)`
- **THEN** 两个测试获得互不相同的 schema(例如 `test_a1b2c3d4` 和 `test_e5f6g7h8`)
- **THEN** 一方的写入 SHALL NOT 影响另一方
- **THEN** 两个测试结束后,两个 schema 均被清理,生产 `claw` schema 不受影响

#### Scenario: 测试进程崩溃时也要能清理

- **WHEN** 测试进程因 panic 或 `kill -9` 中途终止,留下遗弃 schema
- **THEN** `testdb` 包 SHALL 提供 `Reap(maxAge time.Duration)` 辅助,可由 `make db-up` 或独立目标 `make db-reap` 调用,删除超过指定时长的 `test_*` schema
- **THEN** 默认清理阈值 SHALL 为 1 小时

### Requirement: 数据库迁移支持注入 schema 名

两个 Go 服务(`data-aggregator`、`backtest-engine`)的迁移 SHALL 支持在运行时指定目标 schema 名,而不只是硬编码 `claw`。迁移 SQL 文件 SHALL 使用 `{{.Schema}}` 占位符替代裸 `claw.` 表前缀;迁移执行器 SHALL 在应用前通过 `text/template` 渲染占位符。

#### Scenario: 生产环境迁移行为不变

- **WHEN** 生产环境以 `Schema = "claw"` 调用 `store.Migrate(ctx)`
- **THEN** 渲染后的 SQL 与原始硬编码版本逐字节一致
- **THEN** 已存在的 `claw.*` 表、索引、hypertable 不受影响

#### Scenario: 测试环境迁移指向隔离 schema

- **WHEN** 测试代码以 `Schema = "test_abc123"` 调用同一迁移函数
- **THEN** 所有 `claw.` 前缀被渲染为 `test_abc123.`
- **THEN** 迁移完成后,`test_abc123.futures_5m` 等表存在;`claw.*` 不受影响

### Requirement: 外部 API 调用仅由本地金样本提供服务

所有测试 SHALL NOT 发起对 Gate.io(`api.gateio.ws` 或 `gateio-public-data.s3...`)的真实 HTTP 请求。每项涉及 Gate.io 的测试 SHALL 通过 `httptest.Server` + 仓库内的 `testdata/gateio/` 金样本文件返回固定响应。

#### Scenario: 离线测试必须全部通过

- **WHEN** 测试环境断网(例如 CI 或飞机上)
- **THEN** `make test` 的所有 Go / Python / TS 子目标 SHALL 全部通过,无网络错误

#### Scenario: 金样本覆盖关键响应形态

- **WHEN** 查看 `data-aggregator/testdata/gateio/` 和 `backtest-engine/testdata/gateio/`
- **THEN** 目录下 SHALL 至少包含:
  - tickers 响应(1 个 JSON,至少 3 个合约)
  - candles 响应(1 个 JSON,包含可空的 `sum` 字段以测试 quote_volume 处理)
  - S3 CSV gzip 示例(至少 2 个真实月份 × 2 个币种 + 1 个 404 标记文件)

### Requirement: Pipeline 幂等性 flagship 测试

`data-aggregator` SHALL 包含一个 end-to-end-style Go 测试,验证 `SyncService.RunBoot` 在相同数据状态下**重复运行**不重复下载。该测试 SHALL 使用 D5 的金样本服务器,`testdb` 的隔离 schema,并 SHALL 作为 `make test-aggregator` 的一部分运行。

#### Scenario: 第一次 boot 下载缺失月份

- **WHEN** 测试 schema 中 `claw.futures_1h` 已包含 2025-10 和 2025-11 的 BTC_USDT 数据,但没有 2025-12
- **WHEN** 运行 `SyncService` 的同步版 `RunBootSync(ctx)`
- **THEN** S3 fetcher 的 progress.Total 恰好等于 1(仅 2025-12 月份)
- **THEN** progress.Done 等于 1,progress.Failed 等于 0
- **THEN** `claw.futures_1h`(即测试 schema)中 2025-12 的 BTC_USDT 行数 > 0

#### Scenario: 第二次 boot 无额外下载

- **WHEN** 紧接着再次运行 `RunBootSync(ctx)`
- **THEN** S3 fetcher 的 progress.Total 等于 0
- **THEN** 无新行写入 DB
- **THEN** 测试耗时 SHALL 显著短于第一次 boot(至少一个数量级)

### Requirement: 共享 schema 契约测试

`backtest-engine` SHALL 包含一个契约测试,保证其 data-gateway 查询(`QueryKlines`、`ListActiveSymbols`、`QueryGaps`)的 SELECT 列名与 `data-aggregator` 当前迁移产生的表结构一致。迁移 SQL 文件 SHALL 由 `make sync-aggregator-migrations` 从 `data-aggregator/internal/store/migrations/` 复制到 `backtest-engine/testdata/aggregator-migrations/`,测试 SHALL 首先校验该副本的校验和以防止漂移。

#### Scenario: aggregator 迁移改动后 backtest-engine 测试失败

- **WHEN** `data-aggregator` 的某迁移 SQL 文件被修改或新增
- **WHEN** 开发者未运行 `make sync-aggregator-migrations` 就提交
- **THEN** `make test-backtest` 的契约测试 FAILS,错误信息明确提示运行 `make sync-aggregator-migrations`
- **THEN** 失败在任何实际 DB 查询之前发生

#### Scenario: 正常运行校验所有 gateway 查询

- **WHEN** 迁移副本校验和匹配
- **WHEN** 测试对 `test_*` schema apply aggregator 迁移,然后逐个调用三个 gateway 查询
- **THEN** 每个查询返回无错(即使返回零行)
- **THEN** 查询返回的列类型与 handler 的 struct tag 声明兼容

### Requirement: Python sandbox 合规检查测试

`backtest-engine/sandbox/tests/` SHALL 存在 pytest 测试套件,覆盖:
- 每一条 `config.yaml` 中列出的 `forbidden_builtins`(如 `exec`、`eval`、`__import__`)的 AST 检查器 SHALL 拒绝
- 每一条 `forbidden_modules`(如 `os`、`subprocess`、`socket`)的 import SHALL 被拒绝
- `module_whitelist` 中的合法 import 至少一项 SHALL 通过
- `metrics.py` 对固定 10-bar 策略的 Sharpe / max-drawdown / win-rate 计算 SHALL 与 `testdata/golden_metrics.json` 逐字段精确匹配

#### Scenario: 禁用 builtin 被拒绝

- **WHEN** 测试将含有 `exec("1+1")` 的代码片段传给 compliance 检查器
- **THEN** 检查器返回非空违规列表,违规条目包含 `"exec"`

#### Scenario: 白名单模块通过

- **WHEN** 测试将含有 `import numpy as np` 的代码片段传给检查器
- **THEN** 检查器返回零违规

#### Scenario: Metrics 计算与 golden 匹配

- **WHEN** 对固定种子构造的 10 根 K 线策略计算 Sharpe、max-drawdown、win-rate
- **THEN** 三个数值 SHALL 与 `testdata/golden_metrics.json` 中的值在浮点容差(1e-9 绝对或 1e-6 相对)内匹配

### Requirement: Desktop-client Vitest 测试套件

`desktop-client` SHALL 包含由 Vitest 驱动的 TypeScript 测试,由 `make test-desktop` 调起 `pnpm test`(或等效 `npx vitest run`)运行。最小 pilot 覆盖 SHALL 包含:
- `settingsStore` 的主要状态转移
- `pollBacktestResult` 的 done / failed / abort 路径
- 自定义 ESLint 规则 `claw/no-hex-color` 和 `claw/no-raw-jsx-string` 的正反用例(通过 ESLint 官方 `RuleTester`)

#### Scenario: settingsStore 加载持久值

- **WHEN** 测试注入 fake `window.claw.db.settings`,返回 `{ 'remote.baseURL': 'http://foo:9000' }`
- **WHEN** 调用 `useSettingsStore.getState().load()`
- **THEN** `remoteBaseURL` 字段等于 `'http://foo:9000'`

#### Scenario: pollBacktestResult 在 status=done 时解析

- **WHEN** fake status 函数前 2 次返回 `{ status: 'running' }`,第 3 次返回 `{ status: 'done' }`
- **WHEN** 调用 `pollBacktestResult(taskId, onProgress, { intervalMs: 1 })`
- **THEN** `onProgress` 被调用至少 3 次
- **THEN** 返回值为对应的 `backtestResult` 输出

#### Scenario: ESLint 规则拒绝硬编码 hex

- **WHEN** `RuleTester` 对 `<div style={{ color: '#ff0000' }} />` 应用 `no-hex-color` 规则
- **THEN** 规则报告恰好 1 个错误
- **THEN** 错误消息包含 "var(" 提示

### Requirement: Docker E2E 烟雾测试

仓库 SHALL 在 `e2e/` 目录下提供一个 shell 脚本 `run.sh`,`make test-e2e` SHALL 调用它。脚本 SHALL 启动完整 docker-compose 栈(Timescale + aggregator + backtest-engine),使用 `config.test.yaml` 的小规模配置,验证从空 DB 到 `/api/klines` 返回数据的黄金链路,然后 clean teardown。

#### Scenario: 冷启动 E2E 成功

- **WHEN** 执行 `make test-e2e` 时,Docker daemon 运行但 `claw-*` 容器未启动
- **THEN** 脚本 `docker compose up -d --build` 起栈,等待 aggregator 日志出现 `[sync] task ... finished status=done`(超时 300 秒)
- **THEN** `curl http://localhost:8081/api/symbols?limit=2` 返回 HTTP 200,JSON 数组长度等于 2
- **THEN** `curl http://localhost:8081/api/klines?symbol=<seeded>&interval=1h&from=<7d>&to=<now>` 返回 HTTP 200,JSON 数组非空
- **THEN** 脚本 `docker compose down -v` 清理所有容器和卷
- **THEN** 脚本整体退出 0

#### Scenario: aggregator 启动失败时清理仍运行

- **WHEN** aggregator 容器启动失败(例如端口占用)
- **THEN** 脚本打印诊断日志
- **THEN** `trap` 处理器仍执行 `docker compose down -v`
- **THEN** 脚本退出非零

### Requirement: TESTING.md 使用指南

仓库根目录 SHALL 存在 `TESTING.md`,内容 SHALL 包含:首次设置步骤、`make` 目标速查表、各服务添加测试的模板示例、`testdb` 辅助用法、如何刷新 Gate.io 金样本、如何启用可选 pre-commit hook。

#### Scenario: 新成员按 TESTING.md 上手

- **WHEN** 新加入的开发者按 `TESTING.md` 步骤 1-3 操作(启动 Timescale、运行 `make test`、写一个新测试)
- **THEN** 每一步都有可复制的命令
- **THEN** 写新测试的示例覆盖"纯单元"、"需要 DB"、"需要 HTTP handler"三种典型场景

---

