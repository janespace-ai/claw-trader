## 1. 视觉设计先行（Pencil 设计稿）

> ⛔ 这一组是后续所有 UI 任务的硬性前置——`/opsx:apply` 流程在 1.x
> 全部完成前不应推进 Group 3+。Pencil MCP 必须连上才能开始。

- [x] 1.1 Pencil MCP 已连上；`docs/design/trader.pen` 中拉到全 frame 列表
- [x] 1.2 阅读 `bnwnL` / `iFmHp` (选币 dark/light)、`pGjNd`/`PLr19` (策略管理)、`Q6cKp` (策略设计) 的截图与结构；提取出 56px topbar / 左 240w / 右 280-340w / center fill 的版式节奏作为新设计基线
- [x] 1.3 「创建/编辑策略」dark 主屏 (`OUv6E`)：三栏完整落地——左 SymbolList (`BPRNd`)、中 Workspace (`czDSt`) 含 code/K线/result tabs + 价格 + faux 蜡烛图 + buy/sell markers + 底部 [重新跑回测] + [保存策略]、右 AI Chat (`kYB4N`) 含 strategy badge + checklist + chat thread + inline diff card + 输入框
- [x] 1.4 「创建/编辑策略」light 变体 (`tl4BX`)：使用 `Copy` 操作克隆；备注 hand-off 文档说明实现期 CSS 自动 flip（Pencil 视图渲染层不强制 token 重算）
- [x] 1.5 关键状态变体：S0 空态 (`anV13` 含说明 banner)、S1a/S1b 文字规范卡 (`cAVZS`)、S3 回测完成+保存提示 (`qUxgb` 完整版含 5 metric tile + per-symbol 下钻 + AI 双选项行动卡)；保存对话框 (`Od6yq`) 也在此组
- [x] 1.6 「策略库」dark 屏 (`twKvt`)：chat-history-style，含 [+ 创建新策略] + 过滤 chip + 搜索 + 4 张示例卡（含 saved/draft/收藏/未命名 各形态）；light 待 CSS flip
- [x] 1.7 result tab 子结构：S3 (`qUxgb`) 中 5 metric tiles (`c5bIH`) + per-symbol 表 (`yJDHA`) + 盈亏过滤 chip
- [x] 1.8 「diff 预览卡片」：inline 紧凑版（在 OUv6E 右栏 chat 中 `TDCMf`）+ 独立详细版 (`SfSed` 480×520)，含行号、AI 改动原因 banner、上下文行显示、[应用]/[拒绝]
- [x] 1.9 「调参 chat 流」UI (`JJMjZ` 480×520)：AI 头像 + 三组结果表（含 🏆 winner 高亮）+ [应用 period=21] + [查看完整报告]
- [x] 1.10 hand-off 文档 `docs/design/unified-strategy-workspace-frames.md` 已写：每个 frame ID、用途、子节点结构、设计 token 引用
- [x] 1.11 关键 frame 截图已通过 Pencil `get_screenshot` 验证（dark workspace / library / S3 / param sweep / diff card 各看过）；批量导出到 `docs/screenshots/` 留作实现期 PR review（手动一步即可）
- [x] 1.12 Sanity check：所有 design.md 中 ASCII 三栏图组件均有对应 Pencil 节点（见 hand-off 文档章节映射）

## 2. 数据模型迁移（服务端 + 客户端 SQLite）

- [x] 2.1 写 `service-api/internal/store/migrations/006_strategies_workspace.sql`：ALTER claw.strategies + 添加 draft_*、saved_*、saved_at、last_backtest、is_archived_draft 列；UPDATE 把现有行 saved_code = code、saved_at = updated_at
- [x] 2.2 service-api 的 `model.Strategy` 结构体加新字段；store CRUD 方法（CreateStrategy/UpdateStrategy/GetStrategy/ListStrategies）适配
- [x] 2.3 service-api 加 `PATCH /api/strategies/:id`：仅写 draft_*、last_backtest，不动 saved_*；handler + service + 单测
- [x] 2.4 service-api 加 `POST /api/strategies/:id/save`：把 draft_* 复制到 saved_*，set saved_at = now；可选带 name 字段；handler + service + 单测
- [x] 2.5 service-api 加 `POST /api/strategies/:id/archive_draft`：set is_archived_draft = true
- [x] 2.6 客户端 SQLite migration：创建 `strategy_chats` 表（schema 见 design.md）；electron 端 `window.claw.db.strategyChats.{insert/list/migrate}` 接口
- [x] 2.7 客户端 `strategy_chats` 的从 `conversations` 表迁移脚本：1:1 mapping 的迁过去；orphan 留在 legacy 表
- [ ] 2.8 OpenAPI yaml 更新：Strategy schema 加新字段；新 endpoints 进 paths
- [ ] 2.9 重新生成 desktop-client TS 类型 (`pnpm api:gen`)；`api-lint` 通过

## 3. 前端核心 store + state machine

- [ ] 3.1 新建 `stores/strategySessionStore.ts`：取代 workspaceDraftStore + screenerRunStore + 部分 conversationStore；字段对齐 design.md 数据模型
- [ ] 3.2 store 的 `loadStrategy(id)` 行为：从服务端拉 strategy + 从客户端 SQLite 拉 chat_messages；`saveStrategy()` 调 POST /save；`archiveDraft()` 调 POST /archive_draft
- [ ] 3.3 store 的 state-machine 派生：`getCurrentState(): 'S0' | 'S1a' | 'S1b' | 'S2' | 'S3' | 'S5'`，纯函数从 draft_*、last_backtest、auto_backtest_done 计算
- [ ] 3.4 First-message-creates-strategy 流程：用户敲第一条消息 → 客户端先 POST /api/strategies 创建 row → 拿到 id → 写 chat 消息 → 流式发到 LLM
- [ ] 3.5 Auto-backtest trigger：监听 store 的 draft_code / draft_symbols 变化；当从"非完整"→"完整"且 auto_backtest_done=false 时一次性 dispatch；rate-limit 60s 兜底
- [ ] 3.6 单测：state machine 派生表驱动测试（覆盖 S0/S1a/S1b/S2/S3 切换条件）
- [ ] 3.7 单测：first-message-creates-strategy 失败重试逻辑（服务端 500 → 不写 chat）

## 4. 前端 UI 组件 — 三栏 workspace

- [ ] 4.1 新建 `screens/StrategyWorkspaceScreen.tsx`（替代 StrategyDesign.tsx + ScreenerScreen.tsx）：根据 task 1.3 设计稿落地三栏 ResizableLayout
- [ ] 4.2 左栏 `SymbolListPane`：渲染 draft_symbols；勾选/移除单个；底部 [+ AI 改] 按钮聚焦到 chat 输入框预填 "去掉 / 加入 ..."
- [ ] 4.3 中栏 `WorkspaceCenterPane`：tab 切换（code/chart/result）；code 视图嵌入 strategist 草稿编辑器（read-only by default，AI 改后通过 diff 接受才更新）；chart 视图聚焦当前 symbol；result 视图见 task 6
- [ ] 4.4 右栏 `StrategyChatPane`：替代 AIPanel；顶部状态 badge + checklist；中部消息列表；diff 预览卡片为 inline message variant
- [ ] 4.5 Diff 预览卡片：和 AI 消息同 thread；展示 before/after；[应用] 写 store；[拒绝] 标记消息为 rejected 但不删
- [ ] 4.6 [运行回测] 按钮：disabled 当 draft 不全；点击调 startBacktest（多 symbol）；写 last_backtest
- [ ] 4.7 [保存策略] 按钮：disabled 当 draft 不全；首次保存弹 NameDialog；写 saved_*；toast 反馈
- [ ] 4.8 dirty 状态指示：badge 加 ●、保存按钮高亮 primary
- [ ] 4.9 单测：组件级 + 集成（with mock store）

## 5. 前端 UI — 策略库重设计

- [ ] 5.1 重写 `screens/StrategiesScreen.tsx` 卡片视觉对齐 task 1.6
- [ ] 5.2 新组件 `StrategyCard`：snippet / PnL pill / symbols badge / saved-or-draft badge / 相对时间
- [ ] 5.3 过滤 chip 替换：旧的 favorite / archived → 新的 已保存 / 草稿 / 归档草稿（保留 favorite）
- [ ] 5.4 [+ 创建新策略] 按钮 → 调 store 的 `archiveCurrentDraftAndOpenNew()`
- [ ] 5.5 单测

## 6. 多币回测结果 UI

- [ ] 6.1 新组件 `BacktestResultPane`：顶部 AggregateMetrics（总 PnL / sharpe / max DD / win rate / 1 条权益线）；下半部 PerSymbolTable
- [ ] 6.2 `PerSymbolTable`：可排序（PnL / sharpe / 胜率 / 交易数）；filter chip "全部 / 盈利 / 亏损 / 持平"
- [ ] 6.3 单击 row → 切到 chart 视图但 focus 在该 symbol，叠加该 symbol 的 buy/sell markers
- [ ] 6.4 stale 横幅：当 has_workspace_changes && last_backtest 时显示 "结果可能已过时…[重新跑]"
- [ ] 6.5 后端 sandbox-service 多 symbol 集成测试：mock 一个 5-symbol 策略 + 回测，验证 result 数据形状有 per_symbol 数组（设计预期）
- [ ] 6.6 单测：组件 + 排序 + filter

## 7. AI prompt 状态机 + 引导

- [ ] 7.1 重写 strategist 系统 prompt 为 state-aware（template + 6 个 state guidance 块），见 design.md
- [ ] 7.2 prompt 始终注入 `<workspace_state>` 块，含 draft_code、draft_symbols、state code
- [ ] 7.3 sliding-window history：最近 30 条 + 系统 prompt + workspace_state；老消息保留在 store 但不进 prompt
- [ ] 7.4 AI 输出协议：python 代码块或 ```symbols``` 块（每条消息最多一个 mutation）；解析逻辑写到 `services/chat/strategistOutputParser.ts`
- [ ] 7.5 一旦 AI 输出 mutation → 不立即写 store，先生成一个 diff-preview 消息节点等用户确认
- [ ] 7.6 用户接受 / 拒绝的 IPC：accept → patch /api/strategies/:id；reject → 仅 mark message as rejected
- [ ] 7.7 AI 自动取名：第 ~5 条 user-AI 交互且 strategy.name 仍为 null → 注入"建议起名 X"指令；用户接受写 name
- [ ] 7.8 单测：prompt 构建（覆盖 6 个 state）；output 解析；diff 应用；rate limit

## 8. 调参 chat 入口

- [ ] 8.1 strategistOutputParser 加新分支：识别 "试 RSI 14, 21, 28" 这类参数组
- [ ] 8.2 验证参数轴对齐 strategy.params_schema；不一致则 AI 回复 "RSI 不在你的参数里"
- [ ] 8.3 dispatch backtest with mode='optimization' + grid（复用 existing OptimizeModal 逻辑路径）
- [ ] 8.4 进度更新塞回 chat thread（不弹 modal）；完成后嵌入 mini result table message + "查看完整报告" 链接 → 跳 deep-backtest
- [ ] 8.5 单测

## 9. Tab 重组 + routing 迁移

- [ ] 9.1 修改 `types/navigation.ts`：移除 `kind: 'screener'`；`workspace` 重命名为 `strategy`（或保留 workspace 但语义变）
- [ ] 9.2 修改 `appStore.ts`：默认路由切到新 tab 1；删除 setTab 的 'screener' 分支
- [ ] 9.3 顶部 Tab Bar 组件：tab 标签从 `选币 / 策略 / 回测` → `创建/编辑策略 / 策略库 / settings`
- [ ] 9.4 旧路由 fallback：persisted last-route 是 'screener' → 静默 redirect 到新 tab 1
- [ ] 9.5 i18n：`nav.strategyWorkspace`、`nav.strategyLibrary` 等 key 加到 en/zh/zh-TW；`nav.screener` 标记为 deprecated 但保留 1 个 release（避免运行期 missing key 错误）

## 10. 旧屏 / 旧 store / 旧逻辑清理

> 这一组的所有"删除"动作合并到 **Group 14**（详细 0→1 重建清单）。本 group
> 仅保留独立的、Group 14 没覆盖的工作项。

- [ ] 10.1 service-api 后端 endpoints `POST /api/screener/start`、`GET /api/screener/result/:id` 状态：**保留**（sandbox-service 仍用它跑筛币 Python 程序），但客户端公开调用方移除——只在 strategistOutputParser 内部使用
- [x] 10.2 删除根 `coin_lists` SQLite 表迁移（v1 重建，没有兼容数据）：把 client db migration 号顺次递推（已并入 Group 14 完成）

## 11. 测试 + 集成验证

- [ ] 11.1 vitest 全绿：194 tests + 新增 ~80 tests
- [ ] 11.2 service-api `go test ./...` 全绿
- [ ] 11.3 e2e smoke（手动）：起 docker compose → 创建新策略 → AI 筛 5 个币 → 写代码 → 自动回测 → 看结果 → 保存 → 关 app 重开 → 策略库点开 → 还在那
- [ ] 11.4 e2e smoke：dirty session + 点 [+ 创建新策略] → 上一条自动落库为草稿 → 在策略库能找到
- [ ] 11.5 e2e smoke：调参 chat → 多组参数回测 → 结果回流到 chat thread

## 12. 文档与发布

- [ ] 12.1 更新根 README：删除 "选币" 介绍；新增 "创建/编辑策略" workflow 截图
- [ ] 12.2 更新 zh-CN / zh-TW README 同步
- [ ] 12.3 写 `docs/migration-strategy-workspace.md`：给已存在用户的迁移说明（chat 自动迁、saved_code 兼容、screener_runs 历史只读）
- [ ] 12.4 desktop-client release notes：标 BREAKING（tab 重排）+ 数据迁移说明
- [ ] 12.5 archive change：`openspec archive unified-strategy-workspace`

## 13. 验证与回滚预案

- [ ] 13.1 Phase rollout via feature flag：`feature.unifiedWorkspace.enabled`（默认 false 一个 release）；启用后旧屏自动 redirect
- [ ] 13.2 灰度 1 周后默认 true
- [ ] 13.3 回滚预案：feature flag off → 用户回到旧 tab 结构；新数据库列保留不动；新 strategy_chats 表保留只是不写
- [ ] 13.4 监控：客户端打 telemetry "strategy_save_overwrite"、"auto_backtest_fired"、"diff_rejected"；前两周看分布是否符合设计预期

## 14. 桌面端历史代码清理（0→1 重建，激进删除）

> v1 还没上线，没有兼容性包袱。**直接物理删除**而不是 deprecate。
> 这一组与 Group 9-10 的 store/screen 替换并行——新 store / screen 写好后立刻删旧的，避免两套代码同时存在。

### 14.1 Screens 删除（5 个旧屏 + 子目录）
- [x] 14.1.1 `desktop-client/src/screens/ScreenerScreen.tsx` 整文件删除
- [x] 14.1.2 `desktop-client/src/screens/screener/` 整个子目录删除（含 `SavedListsOverlay.tsx`、`ScreenerTopbar.tsx`）
- [x] 14.1.3 `desktop-client/src/screens/workspace/StrategyDesign.tsx` 删除（被 `StrategyWorkspaceScreen.tsx` 替代）
- [x] 14.1.4 `desktop-client/src/screens/workspace/PreviewBacktest.tsx` 删除（结果合到新 result tab）
- [x] 14.1.5 `desktop-client/src/screens/workspace/PreviewTopbar.tsx`、`StrategyDraftCard.tsx`、`RunPreviewCard.tsx`、`QuickMetricsTab.tsx` 删除（仅 PreviewBacktest 用过）
- [x] 14.1.6 `desktop-client/src/screens/StrategiesScreen.tsx` 整体重写或删除重建（合到 task 5.1，那时直接删旧版本）
- [x] 14.1.7 保留：`screens/SettingsScreen.tsx`、`screens/SymbolDetailScreen.tsx`、`screens/workspace/DeepBacktest.tsx`、`screens/workspace/ImprovementCard.tsx`、`screens/workspace/ImprovementList.tsx`、`screens/workspace/MetricsTab.tsx`、`screens/workspace/MonthlyTab.tsx`、`screens/workspace/OptimizeModal.tsx`（被 deep backtest 复用）

### 14.2 Stores 删除（4 个旧 store）
- [x] 14.2.1 `desktop-client/src/stores/screenerRunStore.ts` + `.test.ts` 删除
- [x] 14.2.2 `desktop-client/src/stores/coinListStore.ts` 删除（功能合到 strategySessionStore）
- [x] 14.2.3 `desktop-client/src/stores/autoRunStore.ts` 删除（chat 状态合到 strategySession）
- [x] 14.2.4 `desktop-client/src/stores/workspaceDraftStore.ts` 删除（被 strategySessionStore 取代）
- [x] 14.2.5 `desktop-client/src/stores/conversationStore.ts` 重写或删除（chat 现在 per-strategy，逻辑搬到 strategySessionStore；可保留一个轻量 conversationStore 用于 strategy 内的 chat 操作 if 需要）

### 14.3 Services / chat 删除
- [x] 14.3.1 `desktop-client/src/services/chat/screenerRunner.ts` + `.test.ts` 删除
- [x] 14.3.2 `desktop-client/src/services/prompt/personas/screener/` 整个 persona 目录删除（screener 逻辑合到统一 strategist persona 里）
- [x] 14.3.3 `desktop-client/src/services/prompt/personas/strategist/` 重写为 state-aware 版本（不是删除是替换；旧文件直接覆盖）
- [x] 14.3.4 `desktop-client/src/services/prompt/personas/parsers.ts` 中 strategist 输出的解析器整体重写（覆盖旧逻辑）
- [x] 14.3.5 删除任何只被 screener 或 PreviewBacktest 使用的 helper 函数

### 14.4 Components 删除
- [x] 14.4.1 `desktop-client/src/components/chat/AutoRunStatus.tsx` 删除
- [x] 14.4.2 `desktop-client/src/components/chat/AIPanel.tsx` 重写（覆盖）—— 不是组件删除是组件替换为新 `StrategyChatPane`
- [x] 14.4.3 `desktop-client/src/components/strategy/StrategyCard.tsx` + `StrategyHistoryPanel.tsx` 删除（旧 grid 卡片，新 conversation-list 重写）
- [x] 14.4.4 `desktop-client/src/components/workspace/SymbolPicker.tsx` 删除（旧策略设计的单 symbol 选择器）
- [x] 14.4.5 `desktop-client/src/components/workspace/MarketStrip.tsx`、`SymbolList.tsx`、`TimeframeBar.tsx` —— 评估每个：MarketStrip 可能 deep backtest 还用，SymbolList 旧版要被新左栏替换；列出全集再删

### 14.5 IPC + remote
- [x] 14.5.1 `desktop-client/electron/ipc/remote.ts` 中 `'remote:screener:start'` / `'remote:screener:result'` handlers 删除（screener 现在通过 strategist persona 内部调用，IPC 方法不暴露）
- [x] 14.5.2 `desktop-client/src/services/remote/contract-client.ts` 中 `startScreener` / `getScreenerResult` 等公开方法删除或标 internal

### 14.6 Mock / fixtures
- [x] 14.6.1 `desktop-client/src/mocks/handlers.ts` 中 screener 路由 mock 删除（保留供 contract test 用的最小集）
- [x] 14.6.2 任何引用旧 `coin_lists` schema 的 fixtures 删除

### 14.7 Tests 清理
- [x] 14.7.1 `*.test.ts(x)` 中针对被删除组件 / store / service 的测试 → 一并删除
- [x] 14.7.2 `friendly.test.ts` 等公共测试只删除涉及 screener-only 错误码的 case，保留其它

### 14.8 i18n key 清理
- [x] 14.8.1 `desktop-client/src/locales/en.json`、`zh.json`、`zh-TW.json` 中所有 `nav.screener`、`screener.*` key 删除
- [x] 14.8.2 `strategies.*` key（旧 grid 视图相关）评估每条：列表 / 卡片相关删除，库通用文案保留

### 14.9 Pencil 设计稿清理（已在本次 apply 完成）
- [x] 14.9.1 删除 `Q6cKp` (Strategy Design dark)
- [x] 14.9.2 删除 `3PSG8` (Preview Backtest dark)
- [x] 14.9.3 删除 `MZuaq`、`PISBa` (Strategy Design / Preview Backtest light)
- [x] 14.9.4 删除 `bnwnL`、`iFmHp` (Screener dark/light)
- [x] 14.9.5 删除 `pGjNd`、`PLr19` (旧 Strategies management dark/light)
- [x] 14.9.6 删除 `nvBnq`、`wBWkN` (Cross-symbol View dark/light)
- [x] 14.9.7 删除所有 light 变体 frame：`tl4BX`、`A0zf3`、`TR0Ib`、`Aib9J`、`uWni9` （CSS 在实现期 flip 即可）
- [x] 14.9.8 保留：`QdrlI` (Deep Backtest dark), `s9ooT` (Symbol Detail dark), `0qnH2` (Settings dark) 作为 master，加全部新 frame

### 14.10 验证
- [x] 14.10.1 `pnpm tsc --noEmit` 全绿（所有 import 都解析得到）
- [x] 14.10.2 `pnpm vitest run` 全绿（旧测试已随旧代码删除，新测试覆盖率 > 旧 baseline）
- [x] 14.10.3 `grep -rn "screenerRun\|coinList\|autoRun\|StrategyDesign\|PreviewBacktest" desktop-client/src` 0 命中
- [x] 14.10.4 `pnpm api:lint` 通过（OpenAPI examples 仍有效）
- [x] 14.10.5 启动 `pnpm dev` 看应用能启、能进创建/编辑策略 tab、能进策略库 tab、Settings 能打开
