## ADDED Requirements

### Requirement: Deep Backtest 工作台屏幕

`desktop-client` SHALL 提供 `src/screens/workspace/DeepBacktest.tsx`,实现 Pencil frame `QdrlI`(dark)+ `TR0Ib`(light)的像素级等价渲染。在 `route.kind === "workspace" && workspaceStore.mode === "deep"` 时被渲染。

#### Scenario: 进入 Deep 工作台

- **WHEN** 从 Preview 点击 Confirm + Run Deep,backend 返回 task_id,`workspaceStore.enterDeep(...)`
- **THEN** 屏幕渲染,顶栏显示 "Deep backtest running..." + spinner
- **THEN** 主区渲染 loading skeleton,保留 Watchlist 位置

#### Scenario: Deep 结果到达

- **WHEN** `cremote.getBacktestResult(taskId)` → `done`
- **THEN** 顶栏 summary line 更新 `"Deep backtest complete — {total_return}% return over {lookback_days}d"`
- **THEN** 主 chart 渲染 equity + benchmark + drawdown
- **THEN** MetricsGrid 渲染 10-12 tiles
- **THEN** 下方 tabs 可切

### Requirement: Equity + 基准 + drawdown 堆叠图

主 chart SHALL 使用 `ClawChart.Equity` 变体 `stacked`,上 pane 显示 equity 和 benchmark 两条曲线(同 y 轴,均为百分比回报),下 pane(占 30% 高度)显示 drawdown 区域填充。

#### Scenario: 两条曲线 + drawdown 同屏

- **WHEN** result 含 `summary.equity_curve` + `summary.drawdown_curve`
- **THEN** 上 pane 两条曲线(purple `$accent-primary` 和 yellow `$accent-yellow`),共享 y 轴
- **THEN** 下 pane 显示 drawdown 区域填充(muted red)
- **THEN** x 轴时间刻度两 pane 对齐

#### Scenario: 缺少 benchmark

- **WHEN** result 无 benchmark_equity 字段
- **THEN** 只渲染 strategy equity,上 pane 无 legend 混乱
- **THEN** 下 pane drawdown 仍渲染

### Requirement: 大小 tile 混排的 MetricsGrid

顶部 MetricsGrid SHALL 用 `emphasis: "large"` 标记 5 个关键 metric(Total Return / Sharpe / Max Drawdown / Win Rate / Profit Factor)占大号 tile;其余 6-7 个占标准 tile。布局利用 `auto-fit` 响应式折行。

#### Scenario: 1440px 宽度下的布局

- **WHEN** 视口 1440px,MetricsGrid 满屏宽
- **THEN** 5 大 tile 一行,6 小 tile 跟在下一行或同行 wrap
- **THEN** 大 tile 内 value 字号 24px,小 tile value 18px

### Requirement: OptimLens AI persona + 改进卡片

`AIPersonaShell` 的 `optimlens` persona SHALL 在本 change 中实装:

- 系统 prompt(用于用户后续提问) `src/services/prompt/personas/optimlens.ts`
- RightRail 初始显示 "Click Optimize to generate improvement suggestions" 引导
- 用户点 Optimize CTA → 调用 `cremote.startOptimLens` → 轮询 → 将返回的 `improvements` 列表转成 `<ImprovementCard>` 组件渲染

每个 `ImprovementCard` SHALL:
- 显示 category pill(entry/exit/params/filter/risk_mgmt)
- 显示 title + rationale
- 显示 `expected_delta` 三元:Sharpe / Max DD / Win Rate,+ 颜色
- 显示 `suggested_change`:`param_update` → before→after; `code_edit` → 可折叠 unified diff
- 有 `Apply` 按钮和 `Dismiss` 按钮

#### Scenario: 提交 Optimize 并显示进度

- **WHEN** 用户点 Optimize,选 2 个 params,每个 3 取值(共 9 combos),提交
- **THEN** `cremote.startOptimLens({ strategy_id, param_grid, symbols, lookback_days })` 被调用
- **THEN** RightRail 显示 progress: "Running sweep… (3/9)"
- **THEN** phase 切到 synthesize 时显示 "Analyzing with AI…"
- **THEN** done 时渲染 3-5 个 ImprovementCard

#### Scenario: OptimLens 后端不可用

- **WHEN** `startOptimLens` 返回 404 或 `LLM_PROVIDER_FAILED`
- **THEN** RightRail 显示 "OptimLens unavailable — ..." banner
- **THEN** 屏幕其余部分(metrics / trades / monthly)正常工作

### Requirement: Apply 改进 → 新建策略版本 → 回到 Design

用户点击某个 ImprovementCard 的 Apply SHALL:

1. 读取 `workspaceStore.currentStrategyId` 的 latest version code
2. 根据 `suggested_change.kind`:
   - `param_update`: 正则替换 `self.param('<name>', \d+)` 为新值
   - `code_edit`: 应用 unified diff
3. 调 `cremote.createStrategyVersion({ strategy_id, body: { code: newCode, summary: improvement.title, parent_version: current } })`
4. 调 `workspaceStore.enterDesign(strategy_id)` 回到 Design 屏幕,用户可验证后 Run Preview

#### Scenario: Apply param_update 改进

- **WHEN** improvement `suggested_change: { kind: "param_update", payload: { param_name: "fast", current: 10, suggested: 8 } }`
- **WHEN** 用户点 Apply
- **THEN** code 中 `self.param('fast', 10)` 替换为 `self.param('fast', 8)`
- **THEN** 新 version 创建成功
- **THEN** `workspaceStore.mode === "design"`,Design 屏接管

#### Scenario: Apply code_edit 冲突

- **WHEN** improvement 的 diff 基于 v3,但当前已是 v5
- **THEN** 应用失败,弹出 dialog "Conflict: this improvement was computed for v3, current is v5"
- **THEN** 提供 "Open in Strategies" 按钮跳转手动处理

### Requirement: Optimize 参数选择 modal

点击 Optimize CTA SHALL 弹出 modal `OptimizeModal.tsx`,内容:

- 每个 param(来自 strategy 的 `params_schema`)一行:checkbox(是否扫)/ current default / min / max / step
- 默认 min = current × 0.5,max = current × 1.5,step = 合理整数
- 实时显示总 combo 数,超过 `PARAM_GRID_TOO_LARGE`(50) 禁用 submit
- Submit → `cremote.startOptimLens`

#### Scenario: 无可扫参数

- **WHEN** strategy `params_schema` 为空
- **THEN** Optimize 按钮 disabled(tooltip 说明)
- **THEN** 点击无反应,文案 "No tunable params found"

#### Scenario: 参数组合超限

- **WHEN** 用户配置导致 combos = 64
- **THEN** modal 底部显示 "64 combos — max 50" warning
- **THEN** Submit 按钮 disabled

### Requirement: Monthly 热力图

下方 tabs 中 `Monthly` tab SHALL 渲染 `<MonthlyHeatmap months={summary.monthly_returns} />`:

- 12 列(Jan-Dec)× N 行(年份,从早到晚)
- 每格颜色:red→gray→green 线性插值(按 return_pct)
- Hover 显示 tooltip: 精确 return pct + trade 数
- 每行左侧显示年份标签,每列顶部显示月份缩写

`MonthlyHeatmap` 为新 primitive,放置于 `ui-foundation` primitives 下(属于 ui-foundation 能力的扩展)。

#### Scenario: 180 天回测的月度热力图

- **WHEN** backtest 覆盖 2024-06 到 2024-12(6 个月)
- **THEN** heatmap 渲染 2 行(2024、2025),但 2025 留白(因覆盖到 12 月底)
- **THEN** 每月格子有颜色 + 数值

#### Scenario: 跨 3 年长回测

- **WHEN** backtest 覆盖 3 年(36 个月)
- **THEN** heatmap 渲染 3 或 4 行
- **THEN** 格子变小但 tooltip 保持清晰

### Requirement: 视觉回归快照

`e2e/visual/workspace-deep-backtest.spec.ts` SHALL 覆盖:

- `dark-running`、`light-running`:result 未到时的 loading 态
- `dark-done-no-optimlens`、`light-done-no-optimlens`:result done 但 OptimLens 未触发
- `dark-done-with-optimlens`、`light-done-with-optimlens`:result done + OptimLens 返回 3 个 improvements

#### Scenario: 6 个 baseline

- **WHEN** `pnpm test:visual workspace-deep-backtest.spec.ts`
- **THEN** 6 个快照全部存在并与 baseline 匹配
