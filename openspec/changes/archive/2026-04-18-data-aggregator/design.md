## Context

这是 claw-trader 量化交易系统的第一个模块——数据归集服务。项目从零开始，无现有代码。

数据源为 Gate.io：
- **S3 公共桶** (`gateio-public-data`, AWS Tokyo ap-northeast-1)：提供历史K线 CSV 归档，通过 CloudFront CDN 或直连 S3 访问
- **REST API v4** (`api.gateio.ws`)：提供实时K线数据，rate limit 200 req/s

S3 数据的关键特性（已验证）：
- 合约K线路径：`futures_usdt/candlesticks_{interval}/{YYYYMM}/{PAIR}-{YYYYMM}.csv.gz`
- 可用周期：5m, 1h, 4h, 1d（15m/30m 目录存在但为空）
- CSV 无表头，列顺序：`timestamp, volume(张数), close, high, low, open`（注意非标准顺序）
- 数据追溯至 2017 年，按月更新，当月数据不可用
- 必须直连 S3 源桶（CDN 对部分路径返回 404）

## Goals / Non-Goals

**Goals:**
- 从 Gate.io S3 批量下载合约 top 300（按 USDT 24h 交易额）的历史K线数据
- 支持 6 个周期：5m, 15m, 30m, 1h, 4h, 1d
- 用 API 补全 S3 覆盖不到的最新数据
- 自动检测和修复数据缺口，支持可配置的跳过策略
- 存储于 TimescaleDB，按 interval 分表，预留现货扩展
- 提供 Hertz HTTP API 供前端和回测引擎调用
- Docker Compose 容器化部署

**Non-Goals:**
- 不接入实时 WebSocket 推送（仅 REST 轮询）
- 不支持现货数据（预留 schema，但本期不实现）
- 不包含回测引擎（由独立模块完成）
- 不包含前端 K 线展示（由独立模块完成）
- 不做自动定时同步调度（手动或外部 cron 触发）

## Decisions

### D1: 数据库选型 — TimescaleDB

**选择**: TimescaleDB (PostgreSQL 16 扩展)

**替代方案**: QuestDB（写入更快、`SAMPLE BY` 语法好用）、InfluxDB（时序专用）、DuckDB（嵌入式）

**理由**:
- 标准 SQL + 窗口函数 + CTE，回测查询能力最强
- `time_bucket` + `first`/`last` 天然适合K线聚合
- PostgreSQL 生态无敌，未来扩展（策略存储、交易记录、用户数据）零成本
- 压缩策略（compress_chunk）可节省 ~90% 历史数据空间
- pgx 是 Go 生态中性能最好的 PostgreSQL 驱动，原生支持 COPY 协议

### D2: 分表策略 — 每个 interval 独立 hypertable

**选择**: `claw.futures_{interval}` 共 6 张表，结构完全一致

**替代方案**: 单表 + interval 列区分

**理由**:
- 各表可独立配置 chunk 时间间隔（5m: 7d, 15m: 14d, 1h: 1mo, 4h: 3mo, 1d: 1yr）
- 查询不需额外过滤 interval 列
- TimescaleDB 压缩策略可按表独立设置
- 未来加现货只需创建 `claw.spot_{interval}` 表，零代码改动

### D3: 15m/30m 数据来源 — 从 5m 聚合

**选择**: 历史数据从 5m 用 TimescaleDB SQL 聚合；当月最新数据直接 API 拉取

**替代方案**: 全部走 API（需 ~5400 请求拉取一年数据）

**理由**:
- S3 上 15m/30m 目录为空，无法直接下载
- 从 5m 聚合零网络开销，TimescaleDB `time_bucket` + `first`/`last` 一条 SQL 搞定
- 当月最新的 15m/30m 数据 API 直接返回，无需等 5m 数据完整再聚合

### D4: HTTP 框架 — Hertz

**选择**: CloudWeGo Hertz

**理由**:
- 高性能 Go HTTP 框架，适合数据密集型服务
- 服务化设计，支持后续接入前端、回测引擎等模块
- 同步任务在后台 goroutine 执行，HTTP 层只做触发和查询

### D5: S3 访问方式 — 直连源桶

**选择**: 直接请求 `gateio-public-data.s3.ap-northeast-1.amazonaws.com`

**替代方案**: 通过 CDN (`download.gatedata.org`)

**理由**: CDN 对分钟级数据路径返回 404（已验证），直连 S3 源桶全部正常

### D6: 币种排名数据源 — tickers 端点的 volume_24h_quote

**选择**: `GET /api/v4/futures/usdt/tickers` → 按 `volume_24h_quote` 降序取 top 300

**替代方案**: contracts 端点的 `trade_size`（合约张数）

**理由**: `volume_24h_quote` 直接就是 USDT 成交额，无需根据 `quanto_multiplier` 和价格换算

### D7: 批量写入 — pgx COPY 协议

**选择**: 使用 pgx 的 `CopyFrom` 批量写入

**替代方案**: 逐条 INSERT、批量 INSERT

**理由**: COPY 是 PostgreSQL 最快的写入方式，~3300 万行写入预计 2-3 分钟

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Docker Compose                                                     │
│                                                                     │
│  ┌─────────────────────────────┐    ┌─────────────────────────┐    │
│  │  claw-trader (Go/Hertz)     │    │  timescaledb            │    │
│  │  :8080                      │───▶│  :5432                  │    │
│  │                             │    │                         │    │
│  │  handler/  ← HTTP API 层    │    │  claw.futures_5m        │    │
│  │  service/  ← 业务编排       │    │  claw.futures_15m       │    │
│  │  fetcher/  ← S3 + API      │    │  claw.futures_30m       │    │
│  │  store/    ← pgx/COPY      │    │  claw.futures_1h        │    │
│  │  aggregator/ ← SQL 聚合    │    │  claw.futures_4h        │    │
│  │  gap/      ← 检测+修复     │    │  claw.futures_1d        │    │
│  └─────────────────────────────┘    │  claw.symbols           │    │
│           │          │              │  claw.sync_state        │    │
│           ▼          ▼              │  claw.gaps              │    │
│     Gate.io S3   Gate.io API       └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
Step 1: Symbol Refresh
  GET /api/v4/futures/usdt/tickers → sort by volume_24h_quote → top 300 → claw.symbols

Step 2: S3 Historical (5m, 1h, 4h, 1d)
  S3 gzip CSV → goroutine pool (50) → gunzip → CSV parse → 列顺序重映射 → COPY INTO futures_{interval}
  跳过 sync_state 中 status='done' 的已完成月份

Step 3: Aggregate (15m, 30m)
  SQL: time_bucket('15m'/30m', ts) + first(open,ts) + max(high) + min(low) + last(close,ts) + sum(volume)
  从 futures_5m → INSERT INTO futures_15m / futures_30m

Step 4: API Fill Latest
  对每个 (symbol, interval): 查询 DB 最新 ts → API 分页拉取至 now() → COPY INTO DB
  Rate limit: 180 req/s (留 10% 余量)

Step 5: Gap Detection & Repair
  SQL: LEAD(ts) OVER → 找 gap > expected_interval × 1.5 → 按配置修复或跳过
```

## Database Schema

```sql
-- Schema
CREATE SCHEMA IF NOT EXISTS claw;

-- 每张K线表结构一致 (以 futures_5m 为例)
CREATE TABLE claw.futures_5m (
    ts              TIMESTAMPTZ         NOT NULL,
    symbol          TEXT                NOT NULL,
    open            DOUBLE PRECISION    NOT NULL,
    high            DOUBLE PRECISION    NOT NULL,
    low             DOUBLE PRECISION    NOT NULL,
    close           DOUBLE PRECISION    NOT NULL,
    volume          DOUBLE PRECISION    NOT NULL,
    quote_volume    DOUBLE PRECISION    -- API 有, S3 无 (nullable)
);
SELECT create_hypertable('claw.futures_5m', 'ts', chunk_time_interval => INTERVAL '7 days');
CREATE UNIQUE INDEX ON claw.futures_5m (symbol, ts);

-- Chunk 间隔: 5m=7d, 15m=14d, 30m=1mo, 1h=1mo, 4h=3mo, 1d=1yr
-- 压缩策略: segmentby=symbol, orderby=ts, 5m 2个月后自动压缩

-- 辅助表
-- claw.symbols: 币种列表 (symbol PK, market, rank, trade_size, volume_24h_quote, status, updated_at)
-- claw.sync_state: 同步记录 (symbol, market, interval, source, period, status, row_count, synced_at)
-- claw.gaps: 缺口记录 (id, symbol, market, interval, gap_from, gap_to, missing_bars, status, retry_count)
```

## Project Structure

```
claw-trader/
├── cmd/server/main.go
├── internal/
│   ├── config/config.go
│   ├── handler/{sync,symbol,gap,kline}.go
│   ├── router/router.go
│   ├── service/{sync,symbol,gap}_service.go
│   ├── fetcher/{s3,api}_fetcher.go
│   ├── store/{timescale.go, migrations/}
│   ├── aggregator/aggregator.go
│   ├── gap/{detector,repairer}.go
│   └── model/{candlestick,symbol,gap}.go
├── config.yaml
├── Dockerfile
├── docker-compose.yml
├── go.mod
└── go.sum
```

## Risks / Trade-offs

- **[S3 结构变更]** Gate.io 可能调整 S3 桶路径或文件命名 → S3 fetcher 需配置化 URL 模板，非硬编码
- **[API Rate Limit]** 200 req/s 看似充裕，但 300 币种 × 6 周期补全时需注意突发 → 使用 `golang.org/x/time/rate` 控制在 180 req/s
- **[数据不存在 vs 缺失]** 某些小币种可能某些时段本身就无交易（空K线），不能视为 gap → gap 检测需容忍短期空缺，仅报告连续缺失超过阈值的段
- **[Top 300 变动]** 排名每天变化，之前下载的币种可能掉出 top 300 → 历史数据保留不删，仅停止增量同步
- **[TimescaleDB 压缩锁]** 压缩 chunk 期间该 chunk 不可写入 → 压缩窗口设为 2 个月前，避免与写入冲突
