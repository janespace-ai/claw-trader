## ADDED Requirements

### Requirement: Symbol Detail 屏幕

`desktop-client` SHALL 提供 `src/screens/SymbolDetailScreen.tsx`,实现 Pencil frame `s9ooT`(dark)+ `Aib9J`(light)的像素级渲染。路由 `route.kind === "symbol-detail"` 时被渲染。

路由 shape: `{ kind: "symbol-detail", symbol: string, returnTo: AppRoute, backtestTaskId?: string }`。

#### Scenario: 从 Preview 进入 Symbol Detail

- **WHEN** 用户在 Preview trade journal 点某行 trade
- **THEN** `appStore.navigate({ kind: "symbol-detail", symbol: trade.symbol, returnTo: { kind: "workspace" }, backtestTaskId })`
- **THEN** Symbol Detail 屏渲染
- **THEN** 主 chart 显示该 symbol 的 backtest 期内 klines
- **THEN** trade markers 叠加

#### Scenario: 点击 Back 返回

- **WHEN** 用户点 topbar "Back to summary"
- **THEN** `appStore.route = returnTo`
- **THEN** 回到 Workspace(mode 保留)
- **THEN** 先前 focused 的 trade 恢复(如在表格中高亮)

### Requirement: Topbar 显示 metadata

Topbar SHALL 使用 `cremote.getSymbolMetadata(symbol)` 取 symbol 信息,显示:

- Symbol 代号(大字)
- Last price(`$64,750.00`)
- 24h change pct(色)
- Rank badge(`#1`)
- "Back to summary" 左侧 chevron 链接

#### Scenario: Metadata 加载

- **WHEN** 挂载 Symbol Detail 屏,symbol=BTC_USDT
- **THEN** 调 `cremote.getSymbolMetadata({ symbol: "BTC_USDT" })`
- **THEN** 返回后 topbar 填充 price、change、rank

#### Scenario: Symbol 不存在

- **WHEN** `getSymbolMetadata` 返回 404 `SYMBOL_NOT_FOUND`
- **THEN** 屏幕显示 error state + "Go back" 按钮
- **THEN** 用户返回上一页

### Requirement: Price & Signals 主图

主 chart 区域 SHALL 使用 `ClawChart.Candles` + `ClawChart.Markers`,显示:

- 数据: klines from `cremote.getKlines` covering `backtestTaskId` 的 range
- Markers: 该 symbol 在该 backtest 中的所有 trades(entry + exit,颜色按 pnl 方向)
- 选中 trade 高亮(边框或 pulse)

#### Scenario: 有 backtest 上下文

- **WHEN** 通过 backtestTaskId 进入,backtest 含 12 笔 BTC_USDT trade
- **THEN** chart 显示所有 12 笔的 markers
- **THEN** 正 pnl 交易绿色,负 pnl 红色
- **THEN** 无选中 trade 时无额外 highlight

### Requirement: Trade Journal 虚拟化表格

下方 SHALL 有 Trade Journal 表格(复用 `TradesTab` 的虚拟化):

- 列:#、side、entry_ts、entry_price、exit_ts、exit_price、duration、pnl_pct、reason_in、reason_out
- 过滤:`per_symbol[this_symbol].trades`
- 点击行 → `selectedTradeId` 更新,触发 Trade Analysis

#### Scenario: 选中 trade

- **WHEN** 用户点 trade #4 的行
- **THEN** `selectedTradeId = 4`
- **THEN** 300ms debounce 后,RightRail 发起 `cremote.explainTrade({ backtest_task_id, symbol, trade_id: "#4" })`
- **THEN** chart 上 trade #4 的 markers pulse 高亮

### Requirement: Symbol Equity + Drawdown mini charts

Trade Journal 右侧 SHALL 有两个小 chart 竖排:

- "Symbol Equity" — `ClawChart.Mini` 展示 `per_symbol[symbol].equity_curve`,含当前总回报标题
- "Drawdown" — `ClawChart.Equity variant="single"` 红色区域填充 of drawdown_curve

尺寸约 240×100 每个。

#### Scenario: per_symbol 数据存在

- **WHEN** backtest result 含 `per_symbol[BTC_USDT]`
- **THEN** 两个 mini chart 渲染
- **THEN** 顶部小数字显示总回报(绿/红色)

#### Scenario: per_symbol 数据缺失

- **WHEN** 从 Screener 进入,无 backtestTaskId
- **THEN** 两个 mini chart 隐藏,Trade Journal 也不显示
- **THEN** 页面只保留 chart + metadata,RightRail 显示 "No trade context" 文案

### Requirement: Trade Analysis AI persona

`AIPersonaShell` 的 `trade-analysis` persona SHALL:

- Composer 隐藏(只读)
- 选中 trade 后,debounce 300ms,调 `cremote.explainTrade({ backtest_task_id, symbol, trade_id })`
- 结果以 structured card 渲染,含 narrative、indicators table、entry regime、exit reason pill
- 缓存: 同 trade_id 再次选中时不重新调,直接显示已有 card
- 错误: `LLM_PROVIDER_FAILED` 显示 "Analysis unavailable" banner + retry button

#### Scenario: 首次选中 trade

- **WHEN** 选中 trade #1
- **THEN** RightRail 显示 loading 斯坦bar
- **THEN** `explainTrade` 返回后,显示 narrative card

#### Scenario: 切换 trade 后切回来

- **WHEN** 依次选中 #1 → #2 → #1
- **THEN** 第三次(#1 回来)直接从缓存显示,不重新调接口

#### Scenario: LLM timeout

- **WHEN** `explainTrade` 返回 `LLM_PROVIDER_FAILED`
- **THEN** card 显示 "⚠ Analysis failed: {message}" + Retry 按钮
- **THEN** 点 Retry 重新发起

### Requirement: 入口点接线(Preview + Deep)

Preview Backtest 和 Deep Backtest 的 trade journal 行点击 SHALL 导航到 Symbol Detail:

```
trade.onRowClick → appStore.navigate({
  kind: "symbol-detail",
  symbol: trade.symbol,
  returnTo: <current workspace route>,
  backtestTaskId: workspaceStore.currentTaskId,
})
```

trade row 的选中状态 SHALL 在返回时通过 `workspaceStore.focusedTradeId` 保留,以便用户回来时仍高亮该行。

#### Scenario: Preview → Symbol Detail → 回到 Preview

- **WHEN** Preview 中点某 trade 行
- **THEN** 进入 Symbol Detail
- **WHEN** 点 Back
- **THEN** 回到 Preview,先前选中的 trade 仍高亮

### Requirement: 视觉回归快照

`e2e/visual/symbol-detail.spec.ts` SHALL 覆盖:

- `dark-with-trade-selected.png`、`light-with-trade-selected.png`:主流场景,选中一 trade 后 AI 回复已到
- `dark-no-context.png`:无 backtestTaskId 的降级态

#### Scenario: 3 baseline

- **WHEN** `pnpm test:visual symbol-detail.spec.ts`
- **THEN** 3 baseline 匹配
