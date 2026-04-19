## ADDED Requirements

### Requirement: Preview Backtest 工作台屏幕

`desktop-client` SHALL 提供 `src/screens/workspace/PreviewBacktest.tsx`,实现 Pencil frame `3PSG8`(dark)+ `PISBa`(light)的像素级等价渲染。在 `route.kind === "workspace" && workspaceStore.mode === "preview"` 时被渲染。

#### Scenario: 进入 Preview 工作台

- **WHEN** 从 Strategy Design 点击 Run Preview 成功取到 task_id,`workspaceStore.enterPreview(...)`
- **THEN** 路由保持 workspace,mode 切换到 preview
- **THEN** PreviewBacktest 屏幕渲染
- **THEN** 顶栏 topbar 立刻显示 loading 态 summary line
- **THEN** 主区 chart 显示 focusedSymbol 的 K 线 + loading 气泡

#### Scenario: backtest 结果到达

- **WHEN** `cremote.getBacktestResult(taskId)` 返回 `status: "done"`
- **THEN** 顶栏 summary line 更新为 `"Preview backtest — last 7 days • <N> signals across <M> symbols"`
- **THEN** chart 显示 trade markers(entry 箭头 + exit 三角)
- **THEN** leftRail Watchlist 渲染 per-symbol 列表,按 return desc 排序
- **THEN** 下方 trades tab 可见

#### Scenario: backtest 失败

- **WHEN** `status === "failed"` + `error.code === "SANDBOX_ERROR"`
- **THEN** 顶栏显示 "Preview failed" 红色态
- **THEN** 主区替换为 error card,展示 `error.message` + `error.details.logs`(如有)
- **THEN** 用户可点 "Back to design" 回到 Design 工作台

### Requirement: Watchlist 展示 per-symbol 回测结果

LeftRail 的 `Watchlist` SHALL:

- 以 `backtestResult.per_symbol` 每个 key 为一行
- 每行 mini equity sparkline 来自 `per_symbol[sym].equity_curve`(前 30 点即可)
- 每行显示总回报百分比,绿色正 / 红色负
- 默认按 return desc 排序
- 焦点行视觉 highlight 为 `$surface-tertiary`
- 没有交易的 symbol 仍显示,标注 "no trades"

#### Scenario: 聚焦行切换影响主 chart

- **WHEN** 用户点击 watchlist 中 ETH_USDT 行
- **THEN** `workspaceStore.focusedSymbol === "ETH_USDT"`
- **THEN** 主 chart 重绘为 ETH_USDT 的 K 线 + 其 trades markers
- **THEN** trades tab 也筛选到该 symbol

### Requirement: Trade markers 叠加

主 chart SHALL 在 `ClawChart.Candles` 之上叠加 `ClawChart.Markers`,markers 由 `backtestResult.per_symbol[focusedSymbol].trades` 派生:

- 每笔 trade 两个 marker:entry(↑ for long, ↓ for short)和 exit(hollow △)
- hover marker 显示 tooltip: `"{side} entry @ ${price} · ${pnl_pct}%"`
- 点击 marker 触发 `onMarkerClick(trade_id)`,在 RightRail 的 verdict list 中高亮对应项

#### Scenario: 多个 trade 的 markers

- **WHEN** focusedSymbol 有 12 笔 trade(6 long + 6 short,各有 exit)
- **THEN** chart 显示 24 个 markers,视觉不重叠遮盖(错位 / 不同高度)
- **THEN** 所有 marker 在视口内可点击

### Requirement: Signal Review AI persona 自动触发

屏幕挂载时 SHALL 检查 `workspaceDraftStore.signalReviewTaskId`:
- 若无 → 调用 `cremote.startSignalReview({ backtest_task_id })`,存 id
- 若有 → 直接轮询该 id

轮询完成后,verdict 列表渲染在 RightRail `AIPersonaShell.Transcript` 顶部。

#### Scenario: 首次进入触发 Signal Review

- **WHEN** PreviewBacktest 首次 mount,`signalReviewTaskId` 未设置
- **THEN** 发起 `startSignalReview`
- **THEN** RightRail 显示 loading 文案 "Scanning signals…"
- **THEN** 轮询返回 done 后,verdict pills 渲染

#### Scenario: 重新进入不重复触发

- **WHEN** 用户从 Deep 回到 Preview,`signalReviewTaskId` 已存在
- **THEN** 仅轮询一次取最终结果,不重新 start

### Requirement: Verdict pill 点击联动 chart

RightRail verdict 列表中每个 pill SHALL:

- 颜色: `good` → 绿(`$accent-green`),`questionable` → 黄(`$accent-yellow`),`bad` → 红(`$accent-red`)
- 文本: symbol 简写 + 时间短格式 + AI 的一句评论
- 点击 → 主 chart 滚动时间范围居中 `entry_ts ± 5 bars`,并 briefly 高亮该 marker

反向联动: 点击 chart 上的 marker → 在 verdict 列表中滚动+高亮对应项。

#### Scenario: 点击黄色 pill 定位 chart

- **WHEN** 用户点击 "LINK · 2025-04-18 03:00 · questionable"
- **THEN** 主 chart 切到 LINK_USDT(若尚未)
- **THEN** 视口时间范围居中 `03:00 ± 5 bars`
- **THEN** 对应 entry marker 有短时 pulse 动画(300ms)

### Requirement: Confirm + Run Deep CTA

Topbar 右侧有 "Confirm + Run Deep" 按钮,点击 SHALL:

1. `cremote.startBacktest({ code, config: { symbols: <same>, mode: "deep" } })`
2. 取到 task_id 后 `workspaceStore.enterDeep(newTaskId)`
3. 屏幕 mode 切换到 deep,Deep 工作台 takes over(由 change #6 实现;本 change 下的 deep mode 渲染占位)

#### Scenario: 点击 Confirm 开启深回测

- **WHEN** preview result 已加载,用户点 Confirm + Run Deep
- **THEN** 按钮变 "..."
- **THEN** 短时取到 deep task_id
- **THEN** `workspaceStore.mode === "deep"`
- **THEN** UI 切到 Deep 占位(或实际 Deep 屏,取决于 #6 是否已合)

#### Scenario: Confirm 时 start failed

- **WHEN** `startBacktest` 返回 `COMPLIANCE_FAILED`(理论上不该,因为 preview 已过;但防御)
- **THEN** 按钮恢复
- **THEN** toast 报错

### Requirement: 下方 Trades / Quick Metrics / AI Review tabs

主区 chart 下方 SHALL 有 tabs 切换:

- **Trades**: 虚拟化表格,每行 `TradeRow` 组件(Pencil primitive 映射)。列: side / entry_ts / entry_price / exit_price / duration / pnl_pct。默认按 pnl_pct desc。
- **Quick Metrics**: 复用 `MetricsGrid`,展示从 `backtestResult.summary.metrics` 抽取的 ~6 个 tile(Total Return, Sharpe, Win Rate, Profit Factor, Avg Trade, Total Trades)
- **AI Review**: 在主区下方另一份 verdict list 展示(冗余于 RightRail,针对想看表格视图的用户)

#### Scenario: 默认展示 Trades tab

- **WHEN** 进入 PreviewBacktest
- **THEN** 默认 active tab = Trades
- **THEN** 切换 tab 后选择持久化到 `localStorage` key `preview.activeTab`

#### Scenario: Trades 表按 symbol 过滤

- **WHEN** watchlist 聚焦切到 ETH_USDT
- **THEN** Trades 表只显示 ETH_USDT 的 trade
- **THEN** 表头显示 "ETH_USDT — <N> trades"

### Requirement: 视觉回归快照

`e2e/visual/workspace-preview-backtest.spec.ts` SHALL 存在,覆盖 4 个基线快照:

- `dark-loading.png`、`light-loading.png`:挂载后 result 未到达的 loading 态
- `dark-done.png`、`light-done.png`:result + verdicts 全部到达的稳定态

#### Scenario: 快照覆盖两主题 × 两阶段

- **WHEN** 运行 `pnpm test:visual workspace-preview-backtest.spec.ts`
- **THEN** 四个 baseline 均对比通过(threshold 0.2)
- **THEN** MSW 提供固定数据确保可复现
