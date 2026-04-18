## Why

构建数字货币量化交易系统的数据基础设施。量化回测和策略研发依赖完整、高质量的历史K线数据，需要一个自动化的数据归集服务，从 Gate.io 获取合约市场的历史和实时K线数据，存入时序数据库，并持续保障数据完整性。

## What Changes

- 新增 Go (Hertz) 数据归集服务，提供 HTTP API 触发和查询数据同步
- 从 Gate.io S3 公共桶 (`gateio-public-data`) 批量下载历史K线数据（5m, 1h, 4h, 1d）
- 通过 Gate.io API v4 补全当月最新数据及缺失数据（5m, 15m, 30m, 1h, 4h, 1d）
- 在 TimescaleDB 内通过 `time_bucket` 从 5m 数据聚合生成 15m/30m K线
- 自动检测数据缺口（gap）并按可配置策略修复或跳过
- 按 USDT 24h 交易额排序，维护合约 top 300 币种列表
- TimescaleDB 分表存储（每个 interval 一张 hypertable），预留现货扩展
- Docker Compose 容器化部署（服务 + TimescaleDB）

## Capabilities

### New Capabilities

- `s3-historical-download`: 从 Gate.io S3 公共桶批量下载历史K线 CSV 数据，支持并发下载、流式解压解析、增量同步
- `api-data-fill`: 通过 Gate.io API v4 补全 S3 未覆盖的最新数据及缺失时间段，含 rate limiting 和分页
- `kline-aggregation`: 从 5m K线数据聚合生成 15m/30m 周期数据，利用 TimescaleDB 的 time_bucket/first/last 函数
- `gap-detection-repair`: 检测所有 (symbol, interval) 组合的数据完整性，生成缺口报告，按可配置策略自动修复或跳过
- `symbol-management`: 从 Gate.io API 获取合约列表，按 USDT 24h 交易额排名，维护 top 300 活跃币种
- `timescale-storage`: TimescaleDB 分表 schema 设计（futures_5m/15m/30m/1h/4h/1d），含压缩策略、同步状态追踪、gap 记录
- `sync-api`: Hertz HTTP API，提供同步触发、进度查询、gap 查看、K线数据查询等接口

### Modified Capabilities

（无，这是全新项目）

## Impact

- **新增服务**: Go Hertz HTTP 服务 (端口 8080)
- **数据库**: TimescaleDB (PostgreSQL 16 + TimescaleDB 扩展)，Docker 部署
- **外部依赖**: Gate.io S3 公共数据桶、Gate.io API v4
- **Go 依赖**: hertz, pgx/v5, golang.org/x/time/rate, yaml.v3
- **部署**: Docker Compose 编排，多阶段构建镜像
- **存储**: 预估 ~3 GB（300 币种 × 1 年 × 6 周期，含 TimescaleDB 压缩）
- **网络**: S3 下载 ~405 MB 压缩数据（~14,400 文件），API 补全 ~2,400 请求
