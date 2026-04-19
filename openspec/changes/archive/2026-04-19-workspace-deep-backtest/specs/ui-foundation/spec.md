## ADDED Requirements

### Requirement: MonthlyHeatmap 原语

`desktop-client/src/components/primitives/MonthlyHeatmap/` SHALL 存在,提供 `<MonthlyHeatmap months={MonthlyPoint[]} />` 组件。布局:12 列(Jan-Dec)× N 行(年份),每格颜色按 return_pct 做 red→gray→green 三段插值。支持 hover tooltip。

该原语加入 `ui-foundation` 的 primitives 集合,供 Deep Backtest + Symbol Detail + 未来需要月度回报可视化的屏幕复用。

#### Scenario: 渲染多年数据

- **WHEN** `<MonthlyHeatmap months={[...36 items spanning 3 years]} />`
- **THEN** 渲染 3 行 × 12 列的网格
- **THEN** 无数据月份留白,有数据月份着色

### Requirement: ClawChart.Equity 支持 stacked drawdown 变体

`ClawChart.Equity` SHALL 支持 prop `variant: "single" | "stacked"` + `showDrawdown: boolean` + `compare?: EquityPoint[]`。

- `variant: "single"`:单 pane,可选画一条对比线
- `variant: "stacked"`:上 pane equity + optional compare;下 pane drawdown 区域(占 30% 高度)

实现通过 `lightweight-charts` 的 multi-pane API(创建两个 chart 实例 + 同步时间轴)或 series 内叠加。

#### Scenario: Deep Backtest 使用 stacked

- **WHEN** `<ClawChart.Equity variant="stacked" data={equity} compare={benchmark} drawdown={dd} />`
- **THEN** 上 pane 两条曲线
- **THEN** 下 pane drawdown 红色区域
- **THEN** 两 pane x 轴时间刻度一致
