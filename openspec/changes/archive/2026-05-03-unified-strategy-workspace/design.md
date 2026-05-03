# Design: unified-strategy-workspace

## Context

The thinking that led here is captured in conversation; this document
locks in the 13 decisions and unfolds the consequences (state model,
data shapes, AI state machine, migrations, risks).  Any deviation from
these during apply should round-trip back through `/opsx:explore` —
not be discovered ad hoc in code review.

**Product north star** (informs every tradeoff below):

> 用户尽量少操作、和 AI 多聊天.  When in doubt, push the action into
> the chat where the AI can do it for the user.

## 13 Locked Decisions

| # | Decision | Why |
|---|---|---|
| **1** | Coin list = **frozen snapshot**, not re-evaluable rule | Reproducibility > freshness; user re-asks AI to refilter when needed |
| **2** | `dirty` indicator + **auto-saved draft** on close | Standard editor pattern; no work loss |
| **3** | Save = **true overwrite, no version history** | User explicitly chose simplicity over rollback |
| **4** | AI auto-decides which half (code vs symbols) to mutate, **shows diff** before applying | Lets users undo a wrong AI inference |
| **5** | Multi-symbol results = **aggregate + drill-down** | Standard quant pattern |
| **6** | Empty state = **pure chat-driven**, no template cards | Forces practice of the AI-first ritual |
| **7** | First message **creates strategy row** with `[草稿]` status | No "limbo" state; chat always has a home |
| **8** | LLM context = **always-pin code+symbols + windowed history**; RAG deferred to v2 | Don't over-engineer before measuring |
| **9** | Chat persisted in **client-side SQLite** | Matches Electron app convention; offline-first |
| **10** | `chat = workspace`; `保存策略` button is the **only** commit point that updates `saved_*` | Decouples "researching" from "committing"; matches user mental model |
| **11** | No history search (full-text, fuzzy, or otherwise) | Out of scope for v1; revisit if requested |
| **Q1** | New-strategy click on dirty session: **auto-archive current as draft, open empty new session** | Two-button confirms get tedious; library shows the auto-archive |
| **Q2** | Auto-backtest fires **once** when both halves first complete; subsequent edits → AI prompts re-run, manual button | Avoid spamming sandbox-service on every chat turn |
| **Q3** | AI guidance = **soft prompt + checklist** (UI shows ◯ symbols / ◯ code / ◯ result; AI nudges in text but doesn't lock fields) | Helpful, not bossy |
| **Q4** | Param sweep enters **via chat** ("试 RSI 14, 21, 28"); OptimizeModal stays as power-user fallback | North-star-aligned |
| **Q5** | RAG = **v2**; v1 = simple sliding window + always-pinned code+symbols | Ship first, measure, then optimize |

## State Model

```
┌─────────────────────────────────────────────────────────────────────┐
│  Strategy (the unit of work — one row per "research session")       │
├─────────────────────────────────────────────────────────────────────┤
│  id                  uuid                                            │
│  name                string|null  ← AI auto-names after a few msgs  │
│                                                                      │
│  ─────── Workspace zone (mutates with chat) ─────────                │
│  chat_messages       ChatMessage[]      append-only                  │
│  draft_code          string|null        latest from AI               │
│  draft_symbols       string[]|null      latest snapshot from AI      │
│                                                                      │
│  ─────── Saved zone (mutates only on "Save Strategy") ────           │
│  saved_at            timestamp|null     null until first save        │
│  saved_code          string|null                                     │
│  saved_symbols       string[]|null                                   │
│                                                                      │
│  ─────── Cached side-effects ────────                                │
│  last_backtest       { task_id, summary, ran_at }|null               │
│                                                                      │
│  ─────── Status ────────                                             │
│  is_archived_draft   bool       set true when user pressed +新建   │
│                                  on this session without saving      │
└─────────────────────────────────────────────────────────────────────┘

  Derived properties:
    has_workspace_changes = (draft_code   !== saved_code)
                         ∨ (draft_symbols !== saved_symbols)
    is_committed          = saved_at !== null
    completeness          =
      0 ▸ no draft_code, no draft_symbols
      1 ▸ exactly one half present
      2 ▸ both halves present (auto-backtest condition)
```

## AI-Guided State Machine

```
                    ┌───────────────────────────┐
                    │  S0: empty                │
                    │  AI: "想做啥策略？"       │
                    └─────────┬─────────────────┘
                              │
                ┌─────────────┼─────────────┐
            user聊代码         │         user聊筛币
                ▼              │              ▼
       ┌────────────────┐      │     ┌────────────────┐
       │ S1a: code only │      │     │ S1b: symbols   │
       │ AI:"该选币了"  │      │     │ AI:"该写策略"  │
       └────────┬───────┘      │     └────────┬───────┘
                └──────────────┼──────────────┘
                               ▼ both present
                    ┌───────────────────────────┐
                    │ S2: AUTO-BACKTEST (1×)    │
                    │  → calls sandbox-service  │
                    └─────────┬─────────────────┘
                              ▼
                    ┌───────────────────────────┐
                    │ S3: result shown          │
                    │ AI: "保存？还是调参？"    │
                    └────┬───────────────┬──────┘
              点保存       │               │ 用户聊调参
                          ▼               ▼
              ┌────────────────┐  ┌────────────────────┐
              │ S4: saved      │  │ S5: param sweep    │
              │ saved_*=draft_*│  │ → grid backtest    │
              │ stays in S3    │  │ → multiple results │
              │ until next edit│  │ → S3 (best params) │
              └────────────────┘  └────────────────────┘

  Sub-state on edit (any of S2/S3/S4/S5):
    ▸ chat introduces new code/symbols → workspace becomes dirty
    ▸ AI says "this changes the strategy — re-run backtest? [按钮]"
    ▸ user clicks → S2 again (no auto, just trigger)
```

The state is **derived** from the strategy fields plus a few flags
(`auto_backtest_done_for_this_pair: bool`).  AI's system prompt is
generated per-state with the relevant guidance text injected.

## Three-Pane UI

```
┌──────────────┬──────────────────────────┬───────────────────────────┐
│  Symbols     │   Workspace (中间区)     │   AI Chat                 │
│  (left)      │                          │   (right)                 │
├──────────────┼──────────────────────────┼───────────────────────────┤
│              │  Tabs: [code] [chart]    │  ┌─────────────────────┐ │
│  ✓ BTC/USDT  │         [result]         │  │ Checklist (top)     │ │
│  ✓ ETH/USDT  │                          │  │  ✓ 币列表            │ │
│  ✓ SOL/USDT  │  ─ code 视图：           │  │  ◯ 策略代码          │ │
│  ✓ DOGE      │     ┌────────────────┐   │  │  ◯ 回测结果          │ │
│  ✓ ARB       │     │ class S(...):  │   │  └─────────────────────┘ │
│  ✓ ...       │     │   def setup... │   │  ┌─────────────────────┐ │
│              │     │                │   │  │  你: 帮我筛 …        │ │
│  (clicking   │     │   def on_bar...│   │  │  AI: 已筛 11 个，  │ │
│   focuses    │     └────────────────┘   │  │      展示在左边      │ │
│   chart on   │                          │  │      …             │ │
│   that       │  ─ chart 视图：          │  │  你: 写一个均线策略  │ │
│   symbol)    │     focused symbol's     │  │  AI: ✓ [diff 预览]  │ │
│              │     k-line + indicators  │  │      [应用] [拒绝]   │ │
│  状态：       │                          │  │  你: 跑一下         │ │
│  • 11 个     │  ─ result 视图：         │  │  AI: ⚙️ 跑回测中…    │ │
│              │     聚合 + per-symbol    │  │      …               │ │
│  [+ AI 改]   │     drill-down           │  └─────────────────────┘ │
│              │                          │                           │
│              │  ┌────────────────────┐  │  [▢ 描述新需求…]          │
│              │  │  [运行回测] (亮)   │  │                           │
│              │  │  [保存策略]        │  │                           │
│              │  └────────────────────┘  │                           │
└──────────────┴──────────────────────────┴───────────────────────────┘

  Status indicators:
    ▸ Top-right of chat: name + [草稿] / [已保存] badge + dirty dot ●
    ▸ "保存策略" button:
        - disabled when both halves not present
        - primary highlight when has_workspace_changes && is_committed
        - shows confirm dialog if first save (asks for name)
```

## Library Tab (`策略库`) Redesign

```
┌────────────────────────────────────────────────────────────────────┐
│  搜索/过滤栏 (saved | draft | all)        [+ 创建新策略]           │
├────────────────────────────────────────────────────────────────────┤
│  ⭐ BTC 均值回归 v3                                  2 天前         │
│      "试了 RSI 21，效果比 14 好…"          📈 +18.3%  [11 syms]    │
├────────────────────────────────────────────────────────────────────┤
│     突破策略（小币）              [草稿]            5 天前         │
│      "DOGE/SHIB 突破回测…"                 📉 -2.1%   [8 syms]     │
├────────────────────────────────────────────────────────────────────┤
│     均线穿越（大盘）                              昨天             │
│      "经典 SMA 20/60…"                     📈 +12.5%  [15 syms]    │
└────────────────────────────────────────────────────────────────────┘

  Each row:
   ▸ name (or "未命名" + first-message snippet for unnamed drafts)
   ▸ last assistant or user message preview (1 line)
   ▸ last_backtest pnl pill (green/red)
   ▸ symbols count
   ▸ draft / saved badge
   ▸ updated_at relative time
   ▸ click → open in tab 1 with full chat history loaded
```

## Data Model Changes

### Server-side (`service-api`)

```sql
-- 006_strategies_workspace.sql
ALTER TABLE claw.strategies
  ADD COLUMN draft_code      TEXT,
  ADD COLUMN draft_symbols   JSONB,
  ADD COLUMN saved_code      TEXT,
  ADD COLUMN saved_symbols   JSONB,
  ADD COLUMN saved_at        TIMESTAMPTZ,
  ADD COLUMN last_backtest   JSONB,
  ADD COLUMN is_archived_draft BOOLEAN DEFAULT false;

-- Migrate existing rows: set saved_code = code, saved_symbols = '[]', saved_at = updated_at
UPDATE claw.strategies SET
  saved_code = code,
  saved_symbols = '[]',
  saved_at = updated_at
WHERE saved_code IS NULL;

-- Decision: chat lives client-side (T11), so NO chat columns here.
-- The strategy.id from this table is reused as the FK in client SQLite.
```

The existing `code` column is kept for one release cycle as a read
path for older clients, then dropped in a follow-up.

### Client-side (Electron / SQLite)

```sql
-- New table: per-strategy chat history
CREATE TABLE strategy_chats (
  strategy_id  TEXT NOT NULL,           -- FK to server strategies.id
  msg_idx      INTEGER NOT NULL,        -- ordering within strategy
  role         TEXT NOT NULL,           -- user|assistant|system
  content      TEXT NOT NULL,
  created_at   INTEGER NOT NULL,        -- unix epoch
  metadata     TEXT,                    -- JSON: tool calls, code blocks, etc.
  PRIMARY KEY (strategy_id, msg_idx)
);
CREATE INDEX strategy_chats_strategy_idx ON strategy_chats(strategy_id, msg_idx);

-- Migration: existing `conversations` table is folded in.
-- Each conversation that produced a saved strategy is associated by
-- backfilling strategy_chats from conversations rows where the user
-- has a 1:1 mapping.  Orphan conversations stay in legacy `conversations`
-- table for one release cycle and a manual "import as strategy" UX.
```

## AI System Prompt — State-Aware Skeleton

```
你是 claw-trader 的策略研究助手 (Strategist).

【当前会话状态】
  策略名: {{ strategy.name | default("未命名") }}
  保存状态: {{ saved_at ? "已保存于 " + saved_at : "草稿" }}
  workspace 状态码: {{ state }}    -- one of S0/S1a/S1b/S2/S3/S5

【当前 workspace 内容（始终包含，不裁剪）】
  draft_code:
    {{ draft_code | empty_placeholder }}

  draft_symbols ({{ draft_symbols.length }} 个):
    {{ draft_symbols | join(", ") | truncate(500) }}

【最近 30 条对话】
  ... (windowed history)

【你这一轮该怎么做】
  ▸ S0: 询问用户想做什么类型的策略，介绍 claw 框架的能力。
  ▸ S1a: 用户已有策略代码但缺币列表。建议筛选条件，问"用什么币？"。
       禁止在没有币列表的情况下"假装跑回测"。
  ▸ S1b: 用户已有币列表但缺代码。建议交易思路，问"想用啥信号？"。
  ▸ S2: 后台正在跑首次回测。你不需要回应——结果回来时由系统注入。
  ▸ S3: 回测结果已展示。建议两条路：保存 / 调参。具体地说：
        - 如果指标看起来合理（夏普 > 1，PnL 正），引导保存。
        - 如果欠佳，建议具体调整方向。
  ▸ S5: 参数扫描进行中——同 S2。

【输出协议】
  - 修改 code: 用 ```python ... ``` 包裹，加注释 "// CHANGE: <一句话原因>"
  - 修改 symbols: 用 ```symbols\n["BTC", "ETH", ...]\n``` 标记
  - 同时只能修改一半（原子性，方便用户做 diff 预览）
  - 永远不要憋着 — 修改前先解释一句"我准备改 X，因为 Y"
```

## Migration Plan (apply order, with safety nets)

```
Phase 0  ─── Pencil 视觉稿 ──────────────────────────────  (Task 1)
                ↓ blocks all subsequent UI tasks

Phase 1  ─── Server schema migration  ───  (no UI impact yet)
            ALTER strategies + UPDATE saved_*

Phase 2  ─── New stores + state machine ─  (parallel UI build)
            strategySessionStore replaces drafts + screener stores

Phase 3  ─── New StrategyWorkspace screen ─ behind feature flag
            old screens still work; route flag toggles new

Phase 4  ─── Tab restructure + redirects ──  flag flips on
            选币 tab disappears; ScreenerScreen archived
            策略库 redesigned

Phase 5  ─── AI state-machine prompt ─────
            replace strategist persona

Phase 6  ─── Multi-symbol results UI ─────  (was lightly tested)

Phase 7  ─── Param-sweep via chat ──────  (Q4)

Phase 8  ─── Cleanup ─────────────────  remove dead screens, drop feature flag
```

## Risks

- **Risk: 数据丢失**.  Existing users have strategies + conversations
  in their local SQLite.  Migration script must be idempotent and
  back up the prior DB file before running.
- **Risk: AI 自动跑回测烧钱**.  Q2 caps it to once per pair, but a
  malicious / buggy chat that constantly mutates draft_code+draft_symbols
  could still over-fire.  Mitigation: rate-limit at 1 auto-backtest /
  60 seconds even if both halves change.
- **Risk: 多币回测后端没真跑过**.  `BacktestConfig.symbols: string[]`
  is supported in the type system but the UI only ever sent N=1.
  Add an integration test for N=5 before Phase 6 ships.
- **Risk: state-machine 错判**.  AI inferring "user is editing code
  vs symbols" from message text will sometimes be wrong.  Diff-preview
  + reject button (Decision 4) is the safety net.
- **Risk: chat 历史太长**.  RAG deferred to v2; v1 caps at 30 messages
  in context.  If a user hits a 50-turn strategy and feels AI "loses
  the plot", that's the signal to ship RAG.
- **Risk: 服务端 / 客户端 strategies 漂移**.  Strategy ID generated
  on server insert, then chat lives client-side keyed on it.  If
  server insert fails after first chat message, client must retry
  before showing the chat as "saved" — otherwise orphan messages.
  Mitigation: pessimistic — first message blocks UI until server
  returns the ID.

## Out of Scope (revisit signals)

- **RAG over chat**: ship when a user reports "AI forgot what we
  decided 50 messages ago".
- **Strategy branching / forking**: ship when 2+ users ask for it.
- **Cross-strategy chat search**: low priority; users find strategies
  by browsing the library.
- **Web app version**: T11 (client-side SQLite) makes this harder.
  Defer until product / market signals demand it.
- **Strategy export as a `.json` portable file**: useful for sharing
  but not on the path; revisit after v1 has 5+ active users.
