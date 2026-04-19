# Capability: ui-screener

Synced on 2026-04-19 from archived delta specs in `openspec/changes/archive/`.

### From change: `screener-chart-first`

## ADDED Requirements

### Requirement: Chart-first Screener 屏幕

`desktop-client` SHALL 用 `src/screens/ScreenerScreen.tsx` 替换现有的 `src/pages/ScreenerPage.tsx`,实现 Pencil frame `bnwnL`(dark)+ `iFmHp`(light)的像素级渲染。路由 `route.kind === "screener"` 时被渲染。

#### Scenario: 进入 Screener 屏幕

- **WHEN** 用户点击 TopBar "Screener" tab
- **THEN** `route.kind = "screener"`
- **THEN** 新屏幕渲染:LeftRail watchlist + main chart + RightRail AI persona

### Requirement: LeftRail 使用 Watchlist 展示结果

LeftRail SHALL 使用 `Watchlist` 原语,分两段展示屏选结果:

- "Passed (N)" 默认展开,按 `score` 降序,每行:rank 徽章 + mini chart + 总回报(若 screener 结果含)+ symbol
- "Failed (M)" 默认折叠,点击标题展开

点击某行设置 `focusedSymbol`,驱动主 chart。

#### Scenario: 结果到达后渲染两段

- **WHEN** `cremote.getScreenerResult` 返回 `results` 包含 20 个 passed + 150 个 failed
- **THEN** Watchlist 渲染 Passed(20 行)+ Failed(collapsed,header 显示 "150")
- **THEN** 焦点默认第一个 passed symbol

#### Scenario: 切换 focused symbol

- **WHEN** 用户点 ETH_USDT 行
- **THEN** `workspaceStore.focusedSymbol = "ETH_USDT"` (复用同一 store)
- **THEN** 主 chart 切换到 ETH_USDT
- **THEN** signal markers 重绘

### Requirement: Screener AI persona 整合 auto-run

`AIPersonaShell` 的 `screener` persona SHALL 复用 `change/chat-auto-run-screener` 建立的 auto-run 逻辑:

- 现有 `screenerRunner.ts`、`autoRunStore.ts`、`AutoRunStatus.tsx` 的功能 SHALL 被移入 Screener persona 的 transcript 渲染逻辑
- 无副作用删除原文件后,功能不变

系统 prompt 在 `src/services/prompt/personas/screener.ts`,与现有 `promptMode === "screener"` 的 prompt 等价。

#### Scenario: 用户在 RightRail 对话生成 screener

- **WHEN** 用户输入 "top 20 coins by volume"
- **THEN** persona 生成 screener Python 代码
- **THEN** 自动调用 `cremote.startScreener` → 轮询 → 取结果
- **THEN** 结果填充 LeftRail Watchlist
- **THEN** Transcript 显示 "✓ 20 symbols matched — populated on the left" 状态行

#### Scenario: 迁移后旧文件清理

- **WHEN** change 完成
- **THEN** `src/pages/ScreenerPage.tsx` 不存在
- **THEN** `src/components/chat/AutoRunStatus.tsx` 不存在
- **THEN** 旧代码路径的测试已更新或迁移

### Requirement: 主 chart 信号 markers

主区 `ClawChart.Candles` SHALL 在有 `ScreenerResult.signals_per_symbol[focusedSymbol]` 数据时叠加 signal markers:

- 使用橙色 diamond(和 trade markers 区分开)
- hover 显示 timestamp + indicator 值(若 backend 提供)
- 无数据时 markers 层不渲染(chart 只显示 candles)

#### Scenario: 有信号的 symbol

- **WHEN** focused BTC_USDT,`signals_per_symbol["BTC_USDT"]` 含 12 个时间戳
- **THEN** 主 chart 显示 12 个橙色 diamond markers
- **THEN** hover 显示 "Signal @ 2025-04-18 03:00"

#### Scenario: 无信号的 failed symbol

- **WHEN** focused 某 failed symbol,无对应信号数据
- **THEN** 仅显示 K 线,无 markers

### Requirement: Topbar 控件

Topbar SHALL 包含:

- 左:"Saved lists (N)" 按钮,点击打开 saved-lists overlay
- 中:timeframe chips(5m/15m/1h/4h/1d)—— 仅影响 chart 显示 interval,不影响 screener 逻辑
- 右:"Run screener" 按钮 —— 重跑当前 AI 对话最后产出的代码

#### Scenario: 切换 timeframe

- **WHEN** 用户点 "4h" chip
- **THEN** 主 chart 重 fetch klines with `interval=4h`
- **THEN** markers 的 timestamp 不变(原始数据),但在 4h 蜡烛上对齐显示
- **THEN** Watchlist 的 mini chart 不变(独立数据)

### Requirement: 保存列表 overlay

点击 Topbar "Saved lists" SHALL 打开从左滑入的 overlay 面板:

- 列表来自 `window.claw.db.coinLists.list()`
- 每行:name + symbols count + updated_at + Load 按钮
- 顶部有 "+ Save current" 将当前 Watchlist 的 passed symbols 保存为新列表(prompt 输入 name)
- 点击 Load 把 Watchlist 替换为该列表的 symbols

#### Scenario: 保存当前结果

- **WHEN** Watchlist 有 20 passed,用户点 "+ Save current",输入 name "Top 20 volume"
- **THEN** 新 list 持久化到 SQLite
- **THEN** overlay 更新 list 数

#### Scenario: 加载已保存列表

- **WHEN** 用户点某 saved list 的 Load
- **THEN** Watchlist 重置为该 list 的 symbols,Passed 段显示这些,Failed 段清空
- **THEN** chart 切到列表首个 symbol

### Requirement: 视觉回归快照

`e2e/visual/screener.spec.ts` SHALL 覆盖:

- `dark-empty.png`、`light-empty.png`:无任何 screener 运行,LeftRail 空
- `dark-with-results.png`、`light-with-results.png`:20 passed + 150 failed(collapsed)
- `dark-saved-lists-overlay.png`:saved lists overlay 打开

#### Scenario: 5 个 baseline

- **WHEN** `pnpm test:visual screener.spec.ts`
- **THEN** 5 个 baseline 全部匹配

---

