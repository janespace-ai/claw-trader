## ADDED Requirements

### Requirement: Screener 基类 API

系统 SHALL 提供 `Screener` 基类，用户继承并实现 `filter()` 方法来定义选币逻辑。每个币种独立调用 `filter()`，返回是否通过筛选及评分。

#### Scenario: 最小化选币实现

- **WHEN** 用户提交如下代码：
  ```python
  class MyScreener(Screener):
      def filter(self, symbol, klines, metadata):
          return metadata['volume_24h_quote'] > 1_000_000
  ```
- **THEN** 系统对每个活跃币种调用 `filter()` 方法
- **THEN** 返回 True 的币种被纳入筛选结果

#### Scenario: 带评分的选币

- **WHEN** `filter()` 返回一个数值（float）而非布尔值
- **THEN** 系统将该值作为评分
- **THEN** 评分 > 0 表示通过筛选，评分 ≤ 0 表示未通过
- **THEN** 结果按评分降序排列

### Requirement: K线数据限制为 1h/4h/1d

系统 SHALL 确保选币脚本仅能访问 1h、4h、1d 三个周期的K线数据。禁止访问任何分钟级别（5m、15m、30m）的K线数据。

#### Scenario: 正常访问允许的周期

- **WHEN** 选币脚本访问 `klines['1h']`、`klines['4h']`、`klines['1d']`
- **THEN** 返回对应周期的 DataFrame（含 ts, open, high, low, close, volume, quote_volume 列）
- **THEN** 数据按 ts 升序排列

#### Scenario: 尝试访问分钟级数据

- **WHEN** 选币脚本尝试访问 `klines['5m']` 或 `klines['15m']` 或 `klines['30m']`
- **THEN** 返回 KeyError 或抛出 `PermissionError("minute-level data not available for screener")`
- **THEN** 不影响其他币种的筛选继续执行

#### Scenario: 尝试直接查询数据库分钟表

- **WHEN** 选币脚本尝试直接执行 SQL `SELECT * FROM claw.futures_5m`
- **THEN** 框架层面不暴露直接 SQL 执行接口
- **THEN** 数据仅通过 `klines` 参数获取，无法绕过周期限制

### Requirement: 币种元数据访问

系统 SHALL 为选币脚本提供每个币种的元数据信息，包含排名、交易额、杠杆倍数等。

#### Scenario: 元数据字段

- **WHEN** 选币脚本访问 `metadata` 参数
- **THEN** 包含以下字段：
  - `symbol`: 币种名称（如 "BTC_USDT"）
  - `market`: 市场类型（"futures"）
  - `rank`: 当前排名（1-300，NULL 表示已退出 top 300）
  - `volume_24h_quote`: 24h USDT 交易额
  - `leverage_max`: 最大杠杆倍数
  - `status`: 状态（"active"）

#### Scenario: 基于元数据筛选

- **WHEN** 选币脚本使用 `metadata['leverage_max'] >= 20 and metadata['rank'] <= 100`
- **THEN** 正确返回满足条件的币种

### Requirement: 选币数据范围配置

系统 SHALL 支持配置选币脚本使用的K线数据时间范围。

#### Scenario: 配置选币数据范围

- **WHEN** 提交选币任务，配置 `{"lookback_days": 90}`
- **THEN** `klines` 中每个周期包含最近 90 天的数据
- **THEN** 默认 lookback_days 为 365（一年）

### Requirement: 选币结果输出

系统 SHALL 将选币结果结构化存储，包含通过/未通过状态、评分和原因。

#### Scenario: 选币结果格式

- **WHEN** 选币脚本对所有币种执行完毕
- **THEN** 结果格式为：
  ```json
  {
    "total_symbols": 300,
    "passed": 45,
    "results": [
      {"symbol": "BTC_USDT", "passed": true, "score": 0.95, "rank": 1},
      {"symbol": "ETH_USDT", "passed": true, "score": 0.87, "rank": 2},
      {"symbol": "DOGE_USDT", "passed": false, "score": -0.2, "rank": null}
    ]
  }
  ```
- **THEN** 结果按 score 降序排列

#### Scenario: 单个币种筛选异常

- **WHEN** 选币脚本在处理某个币种时抛出异常
- **THEN** 该币种标记为 `{"passed": false, "error": "异常信息"}`
- **THEN** 继续处理后续币种，不中断整体流程
