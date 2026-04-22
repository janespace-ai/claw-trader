## MODIFIED Requirements

### Requirement: Screener 基类 API

系统 SHALL 提供 `Screener` 基类，用户继承并实现 `filter()` 方法来定义选币逻辑。每个币种独立调用 `filter()`，返回是否通过筛选及评分。基类代码由 sandbox-service 容器持有，不再由 backtest-engine 挂载给一次性容器。

#### Scenario: 最小化选币实现

- **WHEN** 用户提交如下代码：
  ```python
  class MyScreener(Screener):
      def filter(self, symbol, klines, metadata):
          return metadata['volume_24h_quote'] > 1_000_000
  ```
- **THEN** 代码经过两道 Gate 审查后，由 sandbox-service 内的 worker 加载执行
- **THEN** worker 对每个活跃币种调用 `filter()` 方法
- **THEN** 返回 True 的币种被纳入筛选结果

#### Scenario: 带评分的选币

- **WHEN** `filter()` 返回一个数值（float）而非布尔值
- **THEN** 系统将该值作为评分
- **THEN** 评分 > 0 表示通过筛选，评分 ≤ 0 表示未通过
- **THEN** 结果按评分降序排列

#### Scenario: Worker 复用加速

- **WHEN** 用户连续提交 3 个选币任务，都被分配到同一 worker
- **THEN** 第 2、3 个任务复用该 worker 已 warm 的 numpy/pandas/talib
- **THEN** 单任务冷启动开销（~1s）仅第一次产生
