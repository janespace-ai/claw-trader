# result-visualization Specification

## Purpose

TBD — created by archiving change desktop-client. Update Purpose after archive.

## Requirements

### Requirement: K线图与信号标注

系统 SHALL 使用 TradingView Lightweight Charts 展示 K 线图，并在图上标注交易信号点。

#### Scenario: K线图基本展示

- **WHEN** 回测结果加载完成
- **THEN** 展示该币种的 K 线图（OHLC 蜡烛图）
- **THEN** 支持缩放、平移、十字光标

#### Scenario: 信号点标注

- **WHEN** K 线图渲染回测结果
- **THEN** 在对应 K 线上标注：
  - ▲ 绿色向上三角：做多开仓
  - ▼ 红色向下三角：做空开仓
  - ● 绿色圆点：盈利平仓
  - ● 红色圆点：亏损平仓

#### Scenario: 叠加指标线

- **WHEN** 策略使用了 SMA、EMA 等指标
- **THEN** 在 K 线图上叠加对应的指标线
- **THEN** 不同指标用不同颜色区分

#### Scenario: 副图指标

- **WHEN** 策略使用了 RSI、MACD 等需要独立坐标的指标
- **THEN** 在 K 线图下方展示副图
- **THEN** 副图与主图时间轴同步

### Requirement: 组合汇总结果展示

系统 SHALL 在多币种回测完成后展示组合汇总结果。

#### Scenario: 核心指标卡片

- **WHEN** 深度回测完成
- **THEN** 展示核心指标卡片：总收益率、年化收益率、夏普比率、最大回撤、胜率、总交易数
- **THEN** 支持 ALL/LONG/SHORT 维度切换

#### Scenario: 组合权益曲线

- **WHEN** 深度回测完成
- **THEN** 展示所有币种合计的权益曲线图
- **THEN** X 轴为时间，Y 轴为账户权益

#### Scenario: 组合回撤曲线

- **WHEN** 深度回测完成
- **THEN** 展示组合回撤曲线（百分比），与权益曲线上下排列

#### Scenario: 各币种表现排名

- **WHEN** 深度回测完成
- **THEN** 展示各币种表现排名表格，包含：币种名、收益率、夏普、最大回撤、胜率、交易数
- **THEN** 可按任意列排序
- **THEN** 收益为正显示绿色，为负显示红色
- **THEN** 点击某币种行进入单币种详情

#### Scenario: 月度收益热力图

- **WHEN** 深度回测完成
- **THEN** 展示月度收益热力图（行=年份, 列=月份）
- **THEN** 绿色深浅表示盈利大小，红色深浅表示亏损大小

### Requirement: 单币种详情展示

系统 SHALL 支持下钻到单个币种查看详细回测结果。

#### Scenario: 进入单币种详情

- **WHEN** 用户在汇总页点击某个币种
- **THEN** 展示该币种的：
  - K 线图 + 信号标注 + 指标线
  - 权益曲线（仅该币种）
  - 回撤曲线（仅该币种）
  - 指标卡片（仅该币种，ALL/LONG/SHORT）
  - 交易列表（仅该币种）

#### Scenario: 交易列表与 K 线图联动

- **WHEN** 用户在交易列表中点击某笔交易
- **THEN** K 线图自动滚动到该交易的入场时间
- **THEN** 高亮该笔交易的入场和出场标记

#### Scenario: 返回汇总

- **WHEN** 用户在单币种详情页点击「返回汇总」
- **THEN** 返回组合汇总视图

### Requirement: 全部交易列表

系统 SHALL 展示可筛选的完整交易列表。

#### Scenario: 交易列表展示

- **WHEN** 回测完成
- **THEN** 展示交易列表，每行包含：序号、币种、方向（LONG/SHORT）、入场时间、出场时间、收益率、持仓时间
- **THEN** 盈利行显示绿色，亏损行显示红色

#### Scenario: 交易列表筛选

- **WHEN** 用户选择筛选条件
- **THEN** 支持按币种、方向（全部/做多/做空）筛选
- **THEN** 支持按收益率排序
