## ADDED Requirements

### Requirement: 收益类指标

系统 SHALL 计算以下收益类回测指标，分 ALL/LONG/SHORT 三个维度。

#### Scenario: 计算收益指标

- **WHEN** 一次回测执行完成
- **THEN** 结果包含以下收益类指标：
  - `total_return`: 总收益率（%）
  - `annualized_return`: 年化收益率（%）
  - `max_drawdown`: 最大回撤（%）
  - `max_drawdown_duration`: 最大回撤持续时间（天）
  - `profit_factor`: 盈亏比（总盈利 / 总亏损）
  - `expectancy`: 期望值（每笔交易平均盈亏）
  - `equity_final`: 最终权益
  - `equity_peak`: 权益峰值

### Requirement: 风险类指标

系统 SHALL 计算以下风险类回测指标。

#### Scenario: 计算风险指标

- **WHEN** 一次回测执行完成
- **THEN** 结果包含以下风险类指标：
  - `volatility_ann`: 年化波动率（%）
  - `downside_deviation`: 下行偏差
  - `var_95`: 95% Value at Risk
  - `cvar_95`: 95% Conditional VaR (Expected Shortfall)
  - `max_consecutive_wins`: 最大连续盈利次数
  - `max_consecutive_losses`: 最大连续亏损次数

### Requirement: 风险调整类指标

系统 SHALL 计算以下风险调整类回测指标。

#### Scenario: 计算风险调整指标

- **WHEN** 一次回测执行完成
- **THEN** 结果包含以下风险调整类指标：
  - `sharpe_ratio`: 夏普比率（无风险利率默认 0）
  - `sortino_ratio`: 索提诺比率
  - `calmar_ratio`: 卡尔马比率（年化收益 / 最大回撤）
  - `omega_ratio`: 欧米茄比率
  - `win_rate`: 胜率（%）
  - `risk_reward_ratio`: 风险回报比（平均盈利 / 平均亏损）
  - `recovery_factor`: 恢复因子（总收益 / 最大回撤）

### Requirement: 交易分析类指标

系统 SHALL 计算以下交易分析类指标。

#### Scenario: 计算交易分析指标

- **WHEN** 一次回测执行完成
- **THEN** 结果包含以下交易分析类指标：
  - `total_trades`: 总交易次数
  - `avg_trade_return`: 平均交易收益率（%）
  - `avg_win`: 平均盈利交易收益
  - `avg_loss`: 平均亏损交易损失
  - `avg_trade_duration`: 平均持仓时间
  - `max_trade_duration`: 最长持仓时间
  - `long_trades`: 做多交易次数
  - `short_trades`: 做空交易次数
  - `best_trade`: 最佳单笔交易收益率（%）
  - `worst_trade`: 最差单笔交易收益率（%）

### Requirement: ALL/LONG/SHORT 三维度计算

系统 SHALL 对所有指标分别按 ALL（全部交易）、LONG（仅做多）、SHORT（仅做空）三个维度计算。

#### Scenario: 三维度指标输出

- **WHEN** 回测包含做多和做空交易
- **THEN** 每个指标均有三个值：
  ```json
  {
    "sharpe_ratio": {"all": 1.52, "long": 1.78, "short": 0.91},
    "total_trades": {"all": 150, "long": 85, "short": 65},
    "win_rate": {"all": 58.0, "long": 62.3, "short": 52.3}
  }
  ```

#### Scenario: 仅做多策略

- **WHEN** 回测仅包含做多交易
- **THEN** LONG 维度指标与 ALL 维度相同
- **THEN** SHORT 维度指标均为 null 或 0

### Requirement: 时间序列数据

系统 SHALL 输出回测过程中的时间序列数据，用于可视化展示。

#### Scenario: 权益曲线

- **WHEN** 回测完成
- **THEN** 输出 `equity_curve` 数组：`[{"ts": "2025-04-01T00:00:00Z", "equity": 10000}, ...]`
- **THEN** 数据点与主K线频率一致

#### Scenario: 回撤曲线

- **WHEN** 回测完成
- **THEN** 输出 `drawdown_curve` 数组：`[{"ts": "...", "drawdown": -5.2}, ...]`
- **THEN** drawdown 为当前回撤百分比（负值）

#### Scenario: 月度收益

- **WHEN** 回测完成
- **THEN** 输出 `monthly_returns` 数组：`[{"year": 2025, "month": 4, "return": 3.2}, ...]`
- **THEN** 用于热力图展示

#### Scenario: 交易列表

- **WHEN** 回测完成
- **THEN** 输出 `trades` 数组：
  ```json
  [
    {
      "symbol": "BTC_USDT",
      "side": "long",
      "entry_time": "2025-04-01T10:00:00Z",
      "exit_time": "2025-04-02T14:00:00Z",
      "entry_price": 65000,
      "exit_price": 66500,
      "size": 1,
      "leverage": 10,
      "pnl": 1500,
      "return_pct": 23.08,
      "commission": 78.9,
      "duration_hours": 28
    }
  ]
  ```

### Requirement: 参数优化结果

系统 SHALL 在参数优化模式下输出每组参数的核心指标摘要。

#### Scenario: 优化结果排序

- **WHEN** 网格搜索完成 9 组参数回测
- **THEN** 输出 `optimization_results` 数组：
  ```json
  [
    {"params": {"fast": 10, "slow": 30}, "sharpe_ratio": 1.82, "total_return": 45.2, "max_drawdown": -12.3, "total_trades": 120},
    {"params": {"fast": 5, "slow": 20}, "sharpe_ratio": 1.65, "total_return": 38.7, "max_drawdown": -15.1, "total_trades": 185}
  ]
  ```
- **THEN** 按 sharpe_ratio 降序排列
- **THEN** 最佳参数组合的完整指标和时间序列数据一并返回
