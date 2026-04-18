# gap-detection-repair Specification

## Purpose

TBD - created by archiving change data-aggregator. Update Purpose after archive.

## Requirements

### Requirement: 检测数据缺口

系统 SHALL 对每个 (symbol, interval) 组合扫描数据完整性，通过比较相邻记录的时间间隔来发现缺口。当连续缺失超过 expected_interval × 1.5 时标记为 gap。

#### Scenario: 检测到 5m 数据缺口

- **WHEN** 对 BTC_USDT futures_5m 执行 gap 检测
- **THEN** 系统使用 SQL `LEAD(ts) OVER (ORDER BY ts)` 计算相邻记录间隔
- **THEN** 将间隔超过 7.5 分钟（5m × 1.5）的段标记为 gap
- **THEN** 将 gap 记录写入 `claw.gaps` 表（symbol, interval, gap_from, gap_to, missing_bars, status='detected'）

#### Scenario: 无成交时段不误报

- **WHEN** 某小市值币种在凌晨 3:00-3:15 无任何成交
- **THEN** 如果缺失仅 3 根 5m bar（15 分钟），且在容忍阈值内
- **THEN** 系统 SHALL 记录但标记为低优先级，不强制修复

### Requirement: 生成完整性报告

系统 SHALL 为每次 gap 检测生成完整性报告，包含：总期望 bar 数、实际 bar 数、完整率百分比、gap 列表。

#### Scenario: 完整性报告输出

- **WHEN** 完成 BTC_USDT 5m 的 gap 检测
- **THEN** 报告包含：total_expected=105120, total_actual=104980, completeness=99.87%, gaps=[{from, to, missing_bars}...]

### Requirement: 可配置的 gap 修复策略

系统 SHALL 支持以下可配置的修复行为（通过 config.yaml）：
- `max_retry_per_gap`: 每个 gap 最大重试次数（默认 3）
- `skip_on_failure`: 重试失败后是否跳过（默认 true）
- `max_gap_age`: 超过此时长的 gap 不修复（默认 365d）
- `min_completeness`: 低于此完整率才触发修复（默认 99.0%）
- `excluded_symbols`: 排除的币种列表
- `excluded_ranges`: 已知不可修复的时间段列表

#### Scenario: gap 修复重试后跳过

- **WHEN** BTC_USDT 5m 某 gap 修复失败 3 次（max_retry_per_gap=3）
- **THEN** 系统将该 gap 状态更新为 'unrecoverable'
- **THEN** 继续处理下一个 gap，不阻塞整体流程

#### Scenario: 已知维护时段跳过

- **WHEN** config 中 excluded_ranges 包含 `{symbol: "*", from: "2025-08-01T03:00:00Z", to: "2025-08-01T04:00:00Z", reason: "Gate.io maintenance"}`
- **THEN** 所有币种在该时间段的 gap 直接标记为 'skipped'，不尝试修复

### Requirement: gap 修复数据源选择

系统 SHALL 根据 gap 时间范围自动选择修复数据源：S3 覆盖范围内的 gap 重新下载 S3 文件，S3 范围外的 gap 使用 API 拉取。

#### Scenario: S3 范围内的 gap 用 S3 修复

- **WHEN** gap 在 2025-12-15 到 2025-12-16（S3 有 202512 月份数据）
- **THEN** 系统重新下载 `futures_usdt/candlesticks_5m/202512/BTC_USDT-202512.csv.gz`
- **THEN** 解析并写入缺失的记录

#### Scenario: 当月 gap 用 API 修复

- **WHEN** gap 在 2026-04-10 到 2026-04-11（当月，S3 无数据）
- **THEN** 系统通过 API `GET /api/v4/futures/usdt/candlesticks` 拉取该时间段数据
