## 1. 项目初始化与基础设施

- [ ] 1.1 初始化 Go module，配置 go.mod（hertz, pgx/v5, golang.org/x/time/rate, yaml.v3）
- [ ] 1.2 创建项目目录结构（cmd/server, internal/{config,handler,router,service,fetcher,store,aggregator,gap,model}）
- [ ] 1.3 创建 Dockerfile（多阶段构建：golang:1.22-alpine → alpine:3.19）
- [ ] 1.4 创建 docker-compose.yml（claw-trader 服务 + timescaledb 服务，含 healthcheck、volumes、network）
- [ ] 1.5 实现 config.go 和 config.yaml（数据库连接、S3 URL 模板、API 地址、并发数、gap 修复策略等）

## 2. 数据库层 (TimescaleDB)

- [ ] 2.1 创建 SQL migration 文件：claw schema、6 张 futures hypertable（含 chunk 间隔）、UNIQUE 索引
- [ ] 2.2 创建 SQL migration 文件：symbols 表、sync_state 表、gaps 表
- [ ] 2.3 创建 SQL migration 文件：压缩策略（futures_5m 2 个月、futures_1h 6 个月）
- [ ] 2.4 实现 store/timescale.go：数据库连接池初始化、migration 执行
- [ ] 2.5 实现 store/timescale.go：CopyFrom 批量写入 K 线数据方法（动态表名路由 `TableName(market, interval)`）
- [ ] 2.6 实现 store/timescale.go：sync_state CRUD（查询已完成月份、记录下载状态）
- [ ] 2.7 实现 store/timescale.go：gaps CRUD（插入、更新状态、按条件查询）
- [ ] 2.8 实现 store/timescale.go：K线查询方法（按 symbol, interval, from, to 查询，供 API 使用）

## 3. 数据模型

- [ ] 3.1 实现 model/candlestick.go：Candlestick struct（Ts, Symbol, Open, High, Low, Close, Volume, QuoteVolume）
- [ ] 3.2 实现 model/symbol.go：Symbol struct（Symbol, Market, Rank, Volume24hQuote, Status）
- [ ] 3.3 实现 model/gap.go：Gap struct 和 GapReport struct
- [ ] 3.4 实现 model/sync.go：SyncState struct、SyncTask struct（含 task_id, status, progress）

## 4. 币种管理 (Symbol Manager)

- [ ] 4.1 实现 service/symbol_service.go：调用 Gate.io tickers API 获取全部合约 ticker
- [ ] 4.2 实现 service/symbol_service.go：按 volume_24h_quote 降序排列取 top 300
- [ ] 4.3 实现 service/symbol_service.go：写入 symbols 表（upsert），处理排名变动（掉出 top300 的置 rank=NULL）

## 5. S3 历史数据下载 (S3 Fetcher)

- [ ] 5.1 实现 fetcher/s3_fetcher.go：构建 S3 URL（直连源桶，按 market/interval/month/symbol 组合）
- [ ] 5.2 实现 fetcher/s3_fetcher.go：HTTP GET + 流式 gzip 解压 + CSV 解析（列顺序重映射：timestamp,volume,close,high,low,open → ts,open,high,low,close,volume）
- [ ] 5.3 实现 fetcher/s3_fetcher.go：下载任务生成器（300 symbols × 4 intervals × 12 months）
- [ ] 5.4 实现 fetcher/s3_fetcher.go：goroutine worker pool（可配置并发数），带重试（3次，指数退避）
- [ ] 5.5 实现 fetcher/s3_fetcher.go：增量跳过逻辑（查询 sync_state 已完成的月份）
- [ ] 5.6 实现 fetcher/s3_fetcher.go：进度追踪（done/total/failed 计数，供 status API 使用）

## 6. API 数据补全 (API Fetcher)

- [ ] 6.1 实现 fetcher/api_fetcher.go：Gate.io API v4 客户端（构建请求 URL、解析 JSON 响应、字段类型转换）
- [ ] 6.2 实现 fetcher/api_fetcher.go：分页逻辑（limit=2000，以最早 timestamp 向前翻页）
- [ ] 6.3 实现 fetcher/api_fetcher.go：全局 rate limiter（golang.org/x/time/rate, 180 req/s）
- [ ] 6.4 实现 fetcher/api_fetcher.go：补全逻辑（查询 DB 最新 ts → API 拉取至 now()）
- [ ] 6.5 实现 fetcher/api_fetcher.go：支持所有 6 个周期（5m, 15m, 30m, 1h, 4h, 1d）

## 7. K线聚合 (Aggregator)

- [ ] 7.1 实现 aggregator/aggregator.go：5m → 15m 聚合 SQL（time_bucket + first/last/max/min/sum + ON CONFLICT DO NOTHING）
- [ ] 7.2 实现 aggregator/aggregator.go：5m → 30m 聚合 SQL
- [ ] 7.3 实现 aggregator/aggregator.go：按 (symbol, month) 范围增量聚合（仅聚合新下载的数据）

## 8. Gap 检测与修复

- [ ] 8.1 实现 gap/detector.go：单 (symbol, interval) 的 gap 扫描 SQL（LEAD + 间隔阈值判断）
- [ ] 8.2 实现 gap/detector.go：批量扫描所有 (symbol, interval) 组合，生成 GapReport
- [ ] 8.3 实现 gap/repairer.go：加载 config 中的 gap 修复策略（excluded_symbols, excluded_ranges, max_retry 等）
- [ ] 8.4 实现 gap/repairer.go：根据 gap 时间范围选择数据源（S3 or API）并执行修复
- [ ] 8.5 实现 gap/repairer.go：重试 + 跳过逻辑（retry_count 递增，超限标记 unrecoverable）

## 9. 同步编排 (Sync Service)

- [ ] 9.1 实现 service/sync_service.go：完整同步流程编排（symbols → S3 → aggregate → API → gap）
- [ ] 9.2 实现 service/sync_service.go：支持 4 种模式（full, s3, api, repair）
- [ ] 9.3 实现 service/sync_service.go：后台 goroutine 执行，task_id 生成，进度状态管理
- [ ] 9.4 实现 service/sync_service.go：同步完成后输出 summary report

## 10. HTTP API 层 (Hertz Handlers)

- [ ] 10.1 实现 router/router.go：注册所有路由
- [ ] 10.2 实现 handler/sync.go：POST /api/sync/start（触发同步，返回 task_id）
- [ ] 10.3 实现 handler/sync.go：GET /api/sync/status（查询进度）
- [ ] 10.4 实现 handler/symbol.go：GET /api/symbols（查询币种列表）
- [ ] 10.5 实现 handler/gap.go：GET /api/gaps（查询 gap 信息）
- [ ] 10.6 实现 handler/gap.go：POST /api/gaps/repair（触发修复）
- [ ] 10.7 实现 handler/kline.go：GET /api/klines（查询K线数据）

## 11. 启动入口与集成

- [ ] 11.1 实现 cmd/server/main.go：初始化 config → DB 连接 → migration → Hertz server 启动
- [ ] 11.2 验证 docker-compose up 能正常启动两个容器并完成数据库初始化
- [ ] 11.3 端到端测试：触发 full sync → 验证 S3 下载 → 验证聚合 → 验证 API 补全 → 验证 gap 检测
