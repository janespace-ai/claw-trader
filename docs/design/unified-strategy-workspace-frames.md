# Unified Strategy Workspace · Pencil Frame Reference

Designed in `docs/design/trader.pen` as part of openspec change
`unified-strategy-workspace` (Group 1 of tasks.md).

This file is the hand-off contract between the Pencil designs and the
desktop-client implementation tasks (Groups 3-7 of tasks.md).  Every
frame listed here has a stable `nodeId` that engineers reference when
reading the visual or asking for tweaks.

> **Note on theme variants**: the dark workspace was authored first and
> represents the master visual.  A direct `Copy` operation was used for
> the light variant (`tl4BX`) but Pencil's screenshot tool does not
> reliably re-render token bindings to the light values without manual
> theme override on every descendant.  At implementation time, dev
> uses CSS custom properties keyed on `[data-theme="light"]` and the
> tokens flip automatically — no second screen needed.

## Top-level Frame Inventory

### New design artifacts for this change (8)

| ID | Name | Position | Status |
|---|---|---|---|
| `OUv6E` | USW · 创建/编辑策略 · Dark (master) | (0, 4760) | ✅ done — superseded by `A7ubw` (see follow-on change `workspace-three-zone-layout`) |
| `twKvt` | USW · 策略库 · Dark (master) | (3040, 4760) | ✅ done |
| `anV13` | USW · State S0 · 空 workspace | (0, 5760) | ✅ done (annotated reference) |
| `cAVZS` | USW · State Annotations · S1a / S1b | (1520, 5760) | ✅ done (text-only spec card) |
| `qUxgb` | USW · State S3 · 回测结果+保存提示 | (4560, 5760) | ✅ done |
| `SfSed` | USW · Chat · Diff 预览卡 (standalone) | (0, 6760) | ✅ done |
| `Od6yq` | USW · 保存策略对话框 | (560, 6760) | ✅ done |
| `JJMjZ` | USW · Chat · 调参结果卡 | (1120, 6760) | ✅ done |

### Follow-on change `workspace-three-zone-layout` (3)

Layout pivot: left rail = full universe (NOT `draft_symbols`); center splits
vertically into persistent K-line on top + 3-tab area on bottom (选出的币 /
代码 / 回测).  Chat stays in right rail.  See proposal at
`openspec/changes/workspace-three-zone-layout/`.

| ID | Name | Position | Status |
|---|---|---|---|
| `A7ubw` | USW3Z · 创建/编辑策略 · Dark (new master) | (0, 8000) | ✅ done — replaces `OUv6E` for impl |
| `V8qt9` | USW3Z · 中下 · 代码 tab | (1520, 8000) | ✅ done — bottom-area state |
| `O8TIU2` | USW3Z · 中下 · 回测 tab | (1520, 8460) | ✅ done — bottom-area state |

### Follow-on change `workspace-market-depth-and-indicators` (1)

K-line zone restructured to support full market info bar + multiple
stacked indicator subcharts (klinecharts-backed).

| ID | Name | Position | Status |
|---|---|---|---|
| `C3zfc` | USW3Z+ · K线 · 多指标 · Dark | (0, 9000) | ✅ done — main K-line + VOL/RSI/MACD subcharts + indicator picker reference |
| `JHpLq` | USW3Z++ · K线 · 指标交互 · Dark | (0, 9820) | ⚠ superseded by `k2SWCB` — the chip-+-popover model below proved too hidden; flat strip preferred |
| `k2SWCB` | USW3Z+++ · K线 · 平铺指标条 · Dark | (0, 10700) | ⚠ superseded by `o6P9z` — single-row strip preferred over 2-row 主图/副图 split |
| `o6P9z` | USW3Z++++ · K线 · 紧凑布局 · Dark | (0, 10940) | ⚠ partly superseded — top bar split was still wrapping to 2 lines on narrow widths; see `sFW5d` for the truly-1-line design.  K-line 430 + single-row indicator strip parts unchanged |
| `sFW5d` | USW3Z+++++ · 顶部栏单行紧凑 · Dark | (0, 11580) | ✅ done — 48 px hard single-line top bar: drops Gate.io/Futures sublabel, drops the per-bar pct change under price, surfaces +0.01% as an inline pill next to the price; 24h stats become `H/L/Vol/Bars` label-value pairs (gate.com style) |

### Kept legacy frames (still relevant)

| ID | Name | Position | Reason kept |
|---|---|---|---|
| `QdrlI` | Deep Backtest · Dark | (0, 980) | "View full report" drill-down from S3 result tab |
| `s9ooT` | Symbol Detail · Dark | (0, 2940) | Drill-down when user clicks a row in S3 per-symbol table |
| `0qnH2` | Settings · Dark | (1520, 2940) | Settings page (1800h tall — multi-section) |

### Light variants — none kept

Light theme rendering is fully token-driven (`$surface-primary` etc. flip
on `[data-theme="light"]`) and validated via the existing dark/light pair
of any one screen.  We deliberately do **not** maintain a separate Pencil
frame per theme — every dark frame above doubles as the light spec when
read with the light token values.  Engineers wire a theme toggle in CSS
once and ALL screens flip.

### Removed / cleaned up frames (13 deletions, 2026-05-01)

This change deleted the following obsolete frames as part of the
0→1 rebuild (the desktop-client v1 has not shipped, no compat needed):

| ID (deleted) | Was | Replacement |
|---|---|---|
| `Q6cKp` | Strategy Design · Dark | `OUv6E` (unified workspace) |
| `MZuaq` | Strategy Design · Light | CSS flip on `OUv6E` |
| `3PSG8` | Preview Backtest · Dark | Result tab inside `OUv6E` (see `qUxgb` for filled state) |
| `PISBa` | Preview Backtest · Light | CSS flip |
| `bnwnL` | Screener · Dark | Capability removed; AI runs filter inside chat (no dedicated page) |
| `iFmHp` | Screener · Light | Same |
| `pGjNd` | Strategies management · Dark | `twKvt` (conversation-list redesign) |
| `PLr19` | Strategies management · Light | CSS flip |
| `nvBnq` | Cross-symbol View · Dark | Replaced by sortable table inside S3 result; deferred grid view to v2 |
| `wBWkN` | Cross-symbol View · Light | Same |
| `tl4BX` | Failed light clone of `OUv6E` | CSS flip suffices |
| `A0zf3` | Empty placeholder for library light | CSS flip suffices |
| `TR0Ib` | Deep Backtest · Light | CSS flip on `QdrlI` |
| `Aib9J` | Symbol Detail · Light | CSS flip on `s9ooT` |
| `uWni9` | Settings · Light | CSS flip on `0qnH2` |

Total canvas after cleanup: **11 top-level frames** (8 new + 3 kept legacy).

## Master: 创建/编辑策略 Dark (`OUv6E`)

The reference layout for the new front-door tab.  Top bar + 3-column
body (left rail symbols / center workspace / right rail chat).

### Topbar (`Ag5D9`, 56h)
- Brand: logo + "Claw Trader"
- Center nav: tabs **创建/编辑策略** (active, purple-dim) | **策略库**
- Right: 已连接 pill (green) + settings icon

### Left Rail · Symbols (`BPRNd`, 240w)
- Header (`fsvmT`): "币种" label + 11 count pill + strategy name "BTC 均值回归 v1"
- Search box (`VNC3q`): "搜索币种…"
- Symbol list (`b0Y39`): 6 visible rows + "+5 more 滚动查看"
  - Each row: ✓ checkbox + ticker + rank+volume subtitle + 4-bar sparkline
  - The first row (`Rds90`) uses the focused background `surface-tertiary`
- Footer (`B6IdwW`): "AI 帮我改币种" CTA (purple primary)

### Center · Workspace (`czDSt`, fill)
- Tab strip (`I67rKy`, 48h): [代码] [K线 active] [结果 +12.5% pill] · spacer · [BTC/USDT▼] · [1h | 4h purple | 1d]
- Chart canvas (`s9iMy`, fill): price + 24h metrics + faux candlestick chart with green/red bars + 2 buy markers (`Deu14`, `HG3ih`) + 1 sell marker (`IPaPs`)
- Action bar (`t9Mwq`, 64h): dirty indicator (yellow dot · "草稿有改动 · 上次回测 5 分钟前") + [重新跑回测] outlined + [保存策略] purple-primary

### Right Rail · AI Chat (`kYB4N`, 340w)
- Header (`qDXOC`):
  - Strategy badge row: avatar + name + [已保存 ●] (green-dim with yellow dirty dot) + [+ new] icon
  - Checklist (`OdiQt`): ✓ 币列表 (green) · ✓ 策略代码 (green) · ◯ 回测结果 (muted)
- Chat thread (`jmMiD`, fill, clip):
  - User bubble: "筛 24h 成交额 top 30 的币" (purple-dim, right-aligned)
  - AI message: avatar + body + green status chip "已写入 11 个币种"
  - User bubble: "写个 RSI 策略，超卖时买、超买时卖"
  - AI message with **inline diff preview card** (`TDCMf`):
    - Header: "代码改动 (+8 −2)"
    - Body: 4 code-style lines (green for +, red for −)
    - Actions: [应用] purple + [拒绝] outlined
- Input area (`K7kkJ`, fit): "试 RSI 14, 21, 28…" placeholder + send icon

## 策略库 Dark (`twKvt`)

Conversation-style list — replaces the current strategy-card grid.

- Topbar identical pattern but **策略库** is the active tab
- Header row: H1 "策略库" + subtitle "7 个策略 · 5 已保存 · 2 草稿" + [+ 创建新策略] purple
- Filter chips (`WHjDV`): [全部 (7) active] [已保存 (5)] [草稿 (2)] [★ 收藏]
- Search (`L0rr75`): "按名字搜索…" (right-aligned)
- Card list (`a346R6`):
  - **Card 1** (`DuagT`) ★ favorite, "BTC 均值回归 v3" [已保存] / "AI: 调到 RSI 21 之后波动小很多, 最大回撤 -8% → -4%" / +18.3% green pill / 🪙 11 syms / 2 天前
  - **Card 2** (`fupqS`), "突破策略（小币种）" [草稿] / "你: DOGE/SHIB 上的突破回测..." / −2.1% red pill / 🪙 8 syms / 5 天前
  - **Card 3** (`au5Eo`), "均线穿越（大盘）" [已保存] / "AI: 经典 SMA 20/60..." / +12.5% green / 🪙 15 syms / 昨天
  - **Card 4** (`r8DPCn`), "未命名 · 11:32 创建" [草稿] / "你: 帮我想个适合横盘市的策略..." / "—" gray pill (no backtest) / 🪙 0 syms / 刚刚

## State S0 · Empty Workspace (`anV13`)

Cloned from master, with an **annotation banner** (`qCiec`) overlaid
on the center area covering the empty state instructions:

```
STATE: S0 · 空 workspace
AI 起始引导：「想做啥策略？我可以帮你筛币、写代码、跑回测...」

左栏：空（提示「币列表会出现在这里」）
中栏：占位「尚无策略草稿」
右栏：AI 第一条欢迎消息已显示，输入框 placeholder：「描述你的想法…」
底部：[运行回测] disabled、[保存策略] disabled、Checklist 全 ◯
```

## State Annotations · S1a / S1b (`cAVZS`)

Text-only specification card explaining what differs in the two
half-complete states (saves tokens by not re-rendering the whole
workspace twice).  Two side-by-side cards:

- **S1a · 有代码无币** (`ELVfk`): code icon, AI nudges symbol picking, [运行回测] / [保存] disabled with tooltips
- **S1b · 有币无代码** (`N4odM`): coins icon, AI suggests strategy ideas (≥2 candidates), example code block default-collapsed; tap to expand → diff preview flow

## State S3 · 回测结果+保存提示 (`qUxgb`)

The most distinctive variant — what users see right after auto-backtest fires.

- Topbar: green-bordered state badge "STATE: S3 · 自动回测完成 · 引导保存"
- Center pane (`oDGLM`):
  - Tabs: [代码] [K线] [**结果 active** with +18.3% pill]
  - 5 metric tiles (`c5bIH`): PnL +18.3% (huge green), Sharpe 1.81, Max DD −4.2% (red), 胜率 63%, 交易 284
  - Per-symbol table (`yJDHA`): header + filter chips [全部 / 盈利 (8) / 亏损 (3)] + 3 sample rows + "… 5 个盈利 / 3 个亏损" indicator + DOGE −6.8% loss row to show drill-down
- Right rail (`V3wg4`):
  - Header: AI avatar + "BTC 均值回归 v1" + [草稿] (no save yet) + all 3 checklist ✓
  - Chat: user "跑一下吧" → AI response explaining results
  - **Action card** (`UWVRZ`) embedded in AI message:
    - [💾 保存当前版本] — primary [保存策略] CTA
    - [🎚 调参试试看] — invites chat: "试 RSI 14, 21, 28"

## Diff Preview Card · Standalone (`SfSed`, 480×520)

The detailed version of the inline diff card.  Used when a code change
spans more than 4 lines or the user wants a focused review.

- Header (`i8TbP`): AI avatar + "代码改动" + [+8] [−2] pills + filename `strategy.py`
- AI reason banner (`biV4T`): purple-dim background, "加 RSI(14) 信号判断超卖入场，因为你提到过价格波动大"
- Diff body (`KuAGy`) on `surface-primary`:
  - Line 6: ` def setup(self):` (context)
  - Line 7: `   self.sma = self.indicator('SMA', 20)` (context)
  - Line 8 +: `+   self.rsi = self.indicator('RSI', 14)` (green-dim row)
  - Line 9: `def on_bar(self, bar):` (context)
  - Line 10 −: `−   if bar.close > self.sma[-1]:` (red-dim)
  - Line 10 +: `+   if self.rsi[-1] < 30:` (green-dim)
  - Line 11 +: `+       self.buy(size=1)` (green-dim)
- Actions (`Hzql6`): [拒绝] outlined + [✓ 应用] purple

## Save Dialog (`Od6yq`, 480×360)

Modal that appears on the **first** save (when name is null).  Subsequent saves overwrite without dialog.

- Header: 💾 icon + "保存策略" + close X
- Body (`s4InG`):
  - Label "策略名称"
  - Input pre-filled with AI-suggested name "BTC 均值回归 v1" (purple focus border)
  - Hint banner: "AI 已根据对话内容预填名字。"
  - Summary card (`klLlk`): "将保存：" · 策略代码 (180 行) · 币种列表 (11 个) · 上次回测结果 (+12.5%)
- Actions (`VXaT8`): [取消] outlined + [✓ 保存] purple

Re-save (saved_at not null) skips this dialog and just toasts.

## Param Sweep Result Card (`JJMjZ`, 480×520)

In-chat result of a parameter-sweep request.

- Header (`a8WQ1I`): AI avatar + "调参完成 · RSI period × 3" + [最佳 +18.3%] green pill
- Result table (`deB7N`):
  - Columns: period | PnL | Sharpe | 胜率
  - Row 1 (period=14): +12.5% / 1.42 / 58%
  - Row 2 (period=21) **highlighted, green-dim background, 🏆 trophy**: +18.3% / 1.81 / 63%
  - Row 3 (period=28): +8.7% / 1.12 / 54%
- Footer (`vYxYI`): "period=21 表现最好。要应用到当前策略并保存吗？"
  - [✓ 应用 period=21] purple primary
  - [查看完整报告] outlined → links to deep-backtest

## Visual Tokens Used

All from `docs/design/trader.pen`'s document-level variable set:

| Token | Dark | Light | Purpose |
|---|---|---|---|
| `$accent-primary` | #A855F7 | #7C3AED | Active states, primary CTAs, AI brand |
| `$accent-primary-dim` | rgba purple 20% | rgba purple 13% | Subtle accent backgrounds |
| `$accent-green` / `-dim` | #22C55E / α22 | #16A34A / α12 | Saved badge, profitable PnL, "✓" |
| `$accent-red` / `-dim` | #EF4444 / α22 | #DC2626 / α12 | Unprofitable PnL, "−" diff lines |
| `$accent-yellow` / `-dim` | #F59E0B | #D97706 | Draft badge, dirty-indicator dot |
| `$surface-primary` | #0A0A0A | #FFFFFF | App background |
| `$surface-secondary` | #1A1A1A | #F5F5F5 | Rails / cards / dialogs |
| `$surface-tertiary` | #262626 | #E8E8E8 | Inputs, focused row, secondary buttons |
| `$fg-primary` / `-secondary` / `-muted` | #FFFFFF / #A1A1AA / #71717A | #0A0A0A / #525252 / #A3A3A3 | Text hierarchy |
| `$border-subtle` / `-strong` | #27272A / #3F3F46 | #E5E5E5 / #D4D4D8 | Dividers, outlines |
| `$radius-sm/md/lg/xl` | 6/8/12/16 | (same) | Standard radii |
| `$font-heading` / `body` / `data` | Geist / Inter / Geist Mono | (same) | Typography roles |

## How To Use This File (for engineers)

1. **Open the design**: `docs/design/trader.pen` in Pencil app
2. **Locate a frame**: search for the `nodeId` in this doc, jump in Pencil
3. **Inspect tokens**: hover any element to see its bound `$variable`
4. **For implementation**: tokens map 1:1 to `desktop-client/src/styles/tokens.css` CSS custom properties (already exist for dark; add light counterparts in the rename-to-service-api / parallel CSS-tokens task)
5. **Asking for design changes**: reference the frame ID + element name (e.g., "the action card in `qUxgb` — make the trophy icon bigger") and the designer/this conversation can patch directly via `mcp__pencil__batch_design`

## Out of Scope (deferred to v2 / implementation time)

- ☐ State variants S2 (auto-backtest in progress) — straightforward loading state, can lean on existing `<LoadingSpinner>` component pattern
- ☐ Param-sweep input UI in chat — uses existing chat input; no new visual needed
- ☐ Per-symbol detail view (clicking a symbol row in S3 table) — reuses existing K-line chart with markers; chart layer code already exists
- ☐ Library cards' theme-flipped variants — CSS tokens flip automatically
- ☐ Empty state for filter chips when 0 strategies match (cosmetic; toast or inline empty state)
