# strategy-backtest Specification

## Purpose

TBD — created by archiving change service-api. Update Purpose after archive.

## Requirements

### Requirement: Strategy 基类 API

系统 SHALL 提供 `Strategy` 基类，用户继承并实现 `setup()` 和 `on_bar()` 方法来定义交易策略。

#### Scenario: 最小化策略实现

- **WHEN** 用户提交如下代码：
  ```python
  class MyStrategy(Strategy):
      def setup(self):
          self.sma = self.indicator('SMA', period=20)
      def on_bar(self, bar):
          if bar.close > self.sma[-1]:
              self.buy(size=1)
  ```
- **THEN** 系统能正确解析并执行该策略
- **THEN** `setup()` 在回测开始前调用一次
- **THEN** `on_bar()` 在每根已闭合K线上调用一次，按时间顺序

### Requirement: 多周期K线支持

系统 SHALL 支持策略同时访问多个时间周期的K线数据。用户在 `setup()` 中声明主K线和辅助K线周期。

#### Scenario: 主K线 + 辅助K线

- **WHEN** 策略声明 `self.add_data('BTC_USDT', '1d')` 作为辅助数据
- **THEN** `on_bar()` 按主K线周期触发
- **THEN** 通过 `self.data('BTC_USDT', '1d')` 可访问到当前主K线时刻对应的日线数据
- **THEN** 辅助K线数据按主K线时刻自动对齐（使用最近的已闭合 bar）

### Requirement: 跨币种数据访问

系统 SHALL 支持策略访问多个币种的K线数据，用于跨品种策略（如价差交易、相关性策略）。

#### Scenario: 访问其他币种数据

- **WHEN** 策略声明 `self.add_data('ETH_USDT', '1h')`
- **THEN** 在 `on_bar()` 中可通过 `self.data('ETH_USDT', '1h')` 访问 ETH 的 1h K线
- **THEN** 数据包含 open, high, low, close, volume, quote_volume 字段

### Requirement: 杠杆做多做空

系统 SHALL 支持杠杆交易模拟。`buy()` 为做多开仓/做空平仓，`sell()` 为做空开仓/做多平仓。杠杆倍数在下单时指定。

#### Scenario: 杠杆做多

- **WHEN** 策略调用 `self.buy(size=1, leverage=10)`
- **THEN** 以当前 bar 的 close 价格开多仓
- **THEN** 持仓价值为 size × close × leverage
- **THEN** 占用保证金为 size × close

#### Scenario: 杠杆做空

- **WHEN** 策略调用 `self.sell(size=1, leverage=5)`
- **THEN** 以当前 bar 的 close 价格开空仓
- **THEN** 盈亏按做空方向计算（价格下跌盈利）

#### Scenario: 平仓

- **WHEN** 策略调用 `self.close()` 或 `self.close(symbol='BTC_USDT')`
- **THEN** 平掉指定品种的所有持仓
- **THEN** 计算实际盈亏记入账户余额

### Requirement: 内置指标支持

系统 SHALL 提供常见技术指标，用户通过 `self.indicator()` 声明使用。

#### Scenario: 使用内置指标

- **WHEN** 策略调用 `self.indicator('SMA', period=20)` 或 `self.indicator('RSI', period=14)`
- **THEN** 系统自动基于主K线数据计算该指标
- **THEN** 指标值在每根 bar 上自动更新
- **THEN** 支持的内置指标 SHALL 至少包含：SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic, ADX, CCI, Williams %R

#### Scenario: 使用 ta-lib 自定义指标

- **WHEN** 用户直接使用 `import talib` 并自行计算指标
- **THEN** 系统允许并正常执行（ta-lib 在白名单中）

### Requirement: 仅已闭合K线回测

系统 SHALL 仅在K线闭合后触发 `on_bar()`，不模拟 bar 内 tick 数据。订单在下一根 bar 的 open 价格成交（或当前 bar close，取决于配置）。

#### Scenario: 订单成交价格

- **WHEN** 策略在某根 bar 的 `on_bar()` 中调用 `self.buy()`
- **THEN** 默认以该 bar 的 close 价格成交（简化模式）
- **THEN** 可配置为下一根 bar 的 open 价格成交（严格模式）

### Requirement: 参数优化（网格搜索）

系统 SHALL 支持通过声明参数范围进行网格搜索优化。每组参数串行执行完整回测。

#### Scenario: 声明优化参数

- **WHEN** 策略声明参数：
  ```python
  class MyStrategy(Strategy):
      params = {
          'fast_period': [5, 10, 20],
          'slow_period': [20, 30, 50],
      }
  ```
- **THEN** 系统生成 3 × 3 = 9 组参数组合
- **THEN** 对每组参数执行完整回测
- **THEN** 返回所有组合的回测结果，按 Sharpe Ratio 降序排列

#### Scenario: 参数组合超过上限

- **WHEN** 参数笛卡尔积组合数超过 `max_optimization_runs`（默认 100）
- **THEN** 系统从组合中均匀采样 100 组执行
- **THEN** 结果中标注 "sampled N out of M total combinations"

#### Scenario: 无优化参数

- **WHEN** 策略未声明 `params` 或 `params` 为空
- **THEN** 执行单次回测，不触发优化流程

### Requirement: 回测配置

系统 SHALL 支持通过 API 传入回测配置参数，包括交易品种、时间范围、初始资金等。

#### Scenario: 完整回测配置

- **WHEN** 提交回测任务，配置如下：
  ```json
  {
    "symbols": ["BTC_USDT"],
    "interval": "1h",
    "from": "2025-04-01",
    "to": "2026-04-01",
    "initial_capital": 10000,
    "commission": 0.0006,
    "slippage": 0.0001,
    "fill_mode": "close"
  }
  ```
- **THEN** 系统使用该配置初始化回测引擎
- **THEN** `commission` 为每笔交易手续费率
- **THEN** `slippage` 为滑点模拟（价格偏移比例）
- **THEN** `fill_mode` 为 "close"（当前 bar 收盘价成交）或 "next_open"（下一根 bar 开盘价）
