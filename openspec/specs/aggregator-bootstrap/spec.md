# aggregator-bootstrap Specification

## Purpose

Defines the boot-time lifecycle of the `data-aggregator` process: how it self-checks data completeness and backfills without any external trigger. This capability replaces the old HTTP-trigger model under `sync-api`, which has been removed.

## Requirements

### Requirement: 启动时自动执行数据同步管线

`data-aggregator` 进程 SHALL 在完成 DB 连接与 migration 后,无需外部触发,自动在后台 goroutine 中执行一次完整的数据同步管线:`refresh symbols → detect gaps → S3 backfill missing → aggregate → API fill missing → detect → repair`。HTTP 服务器(若保留 `/healthz`)的启动 SHALL NOT 依赖该管线完成。

#### Scenario: 冷启动(DB 中尚无 K 线)

- **WHEN** aggregator 进程启动,且 `claw.klines_*` 表为空
- **THEN** `/healthz` 在 DB 连接成功后即返回 200
- **THEN** 后台管线顺序执行:刷新 symbols → 检测到所有 (symbol, interval) 均为空 → 逐月下载 S3 CSV → 聚合 → 用 API 补近月 → 再次检测 → 修复残余 gap
- **THEN** 管线各阶段进度写入日志,不阻塞健康检查

#### Scenario: 热启动(DB 中已有大部分历史数据)

- **WHEN** aggregator 进程重启,DB 中已存在近 6 个月大部分 K 线
- **THEN** `detect gaps` 阶段只返回少量缺口
- **THEN** S3 阶段只下载 gap 所覆盖月份的 CSV,不重下已完整的月份
- **THEN** API 阶段只补 S3 无法覆盖的段落(通常是当月最新)
- **THEN** 管线完成耗时显著短于冷启动

### Requirement: 管线幂等且支持断点续跑

同步管线 SHALL 以"检测优先 + 只补缺失"为驱动,使得任何阶段失败或进程被杀后,**下次启动**能从 DB 当前状态继续补齐,而非从零重下。S3 与 API 写入 SHALL 使用 upsert 语义,避免重复记录或冲突。

#### Scenario: 管线中途被杀

- **WHEN** S3 下载阶段进行到 50% 时进程被杀(OOM / SIGTERM)
- **WHEN** 稍后进程重启
- **THEN** 新一轮 detect 阶段识别到已完成的 symbol/月份 无缺口,自动跳过
- **THEN** 管线只对仍有缺口的 symbol/月份下载剩余数据

#### Scenario: S3 某文件 404

- **WHEN** S3 上 `futures_usdt/candlesticks_5m/202508/XYZ_USDT-202508.csv.gz` 返回 404
- **THEN** aggregator 记录错误并继续其他 symbol/月份
- **THEN** 最终 gap repair 阶段尝试用 API 补该段
- **THEN** 若仍无法修复,按 `gap-detection-repair` 既有策略标记为 `unrecoverable`,不阻断后续启动

### Requirement: 管线完成后进程保持存活

boot 管线执行完毕后,aggregator 进程 SHALL 继续运行,直到收到 SIGINT / SIGTERM。进程 SHALL NOT 自动退出,也 SHALL NOT 周期性地重新启动管线(周期性同步与 WebSocket 实时同步属于后续 change 范围)。

#### Scenario: 管线完成后

- **WHEN** boot 管线走到最终阶段,日志输出 `[sync] task <id> finished status=done`
- **THEN** 进程继续运行
- **THEN** 不再发起任何 Gate.io 请求,直到进程被重启

#### Scenario: 收到终止信号

- **WHEN** 进程收到 SIGTERM
- **THEN** 进程退出,代码 0(若 boot 管线已完成)或非 0(若失败)

### Requirement: aggregator 不对外暴露业务接口

`data-aggregator` 进程 SHALL NOT 注册任何面向前端或其他服务的业务 HTTP 路由(`/api/*`)。允许的唯一 HTTP 路由是 `GET /healthz`,用于容器存活探针,且 SHALL 默认绑定到 `127.0.0.1`,不对外监听。

#### Scenario: 前端尝试访问 aggregator

- **WHEN** 任一外部客户端(desktop-client、前端浏览器等)向 aggregator 的 `/api/*` 路径发起请求
- **THEN** 该请求失败(连接拒绝或 404),因为路由不存在,且 aggregator 端口不对外监听

#### Scenario: 容器存活探针

- **WHEN** 容器运行时对 `GET http://127.0.0.1:<port>/healthz` 发起请求
- **THEN** 返回 `200 {"status":"ok"}`,前提是 DB 连接和 migration 已完成
- **THEN** 该状态 SHALL NOT 反映 boot 管线是否完成
