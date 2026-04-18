# s3-historical-download Specification

## Purpose

TBD - created by archiving change data-aggregator. Update Purpose after archive.

## Requirements

### Requirement: S3 批量下载历史K线数据

系统 SHALL 从 Gate.io S3 公共桶 (`gateio-public-data.s3.ap-northeast-1.amazonaws.com`) 下载合约历史K线 CSV 数据。

支持的周期和文件模式：
- `futures_usdt/candlesticks_5m/{YYYYMM}/{PAIR}-{YYYYMM}.csv.gz`（按月）
- `futures_usdt/candlesticks_1h/{YYYYMM}/{PAIR}-{YYYYMM}.csv.gz`（按月）
- `futures_usdt/candlesticks_4h/{YYYYMM}/{PAIR}-{YYYYMM}.csv.gz`（按月）
- `futures_usdt/candlesticks_1d/{YYYYMM}/{PAIR}-{YYYYMM}.csv.gz`（按月）

系统 SHALL 直连 S3 源桶而非 CloudFront CDN。

#### Scenario: 下载单个币种单个月份的5m数据

- **WHEN** 触发同步，币种 BTC_USDT，周期 5m，月份 202503
- **THEN** 系统请求 `futures_usdt/candlesticks_5m/202503/BTC_USDT-202503.csv.gz`
- **THEN** 流式解压 gzip 并解析 CSV（列顺序：timestamp, volume, close, high, low, open）
- **THEN** 重映射为标准顺序 (ts, symbol, open, high, low, close, volume) 写入 `claw.futures_5m`

#### Scenario: 下载全量历史数据

- **WHEN** 触发完整 S3 同步，币种列表 300 个，时间范围 12 个月
- **THEN** 系统生成 300 × 4 周期 × 12 月 = 14,400 个下载任务
- **THEN** 使用 goroutine worker pool（可配置并发数，默认 50）并发执行

### Requirement: 增量同步跳过已完成月份

系统 SHALL 在下载前检查 `claw.sync_state` 表，跳过 status='done' 的 (symbol, interval, period) 组合。

#### Scenario: 重复运行同步不重复下载

- **WHEN** 第二次运行 S3 同步，且 BTC_USDT 5m 202503 已在 sync_state 中标记为 done
- **THEN** 系统跳过该文件的下载
- **THEN** 仅下载 sync_state 中不存在或 status != 'done' 的任务

### Requirement: 下载失败不阻塞其他任务

系统 SHALL 在单个文件下载失败时记录错误并继续处理其他任务，不阻塞整个同步流程。

#### Scenario: 某个文件下载超时

- **WHEN** BTC_USDT 5m 202503 下载超时
- **THEN** 系统记录该任务到 sync_state（status='failed', error_msg=超时信息）
- **THEN** 继续处理队列中的下一个任务
- **THEN** 最终报告中包含失败任务列表

### Requirement: CSV 列顺序重映射

系统 SHALL 将 Gate.io S3 CSV 的列顺序 `timestamp, volume, close, high, low, open` 重映射为标准 OHLCV 顺序 `ts, open, high, low, close, volume` 后写入数据库。

#### Scenario: 解析并重映射 CSV 行

- **WHEN** 读取到 CSV 行 `1740787200,576594,84242.5,84333.3,84205.5,84296.7`
- **THEN** 写入数据库的记录为 ts=1740787200, open=84296.7, high=84333.3, low=84205.5, close=84242.5, volume=576594
