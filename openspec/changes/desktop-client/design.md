## Context

claw-trader 系统已有两个后端服务：data-aggregator（数据归集，:8080）和 backtest-engine（回测引擎，:8081）。桌面客户端是面向终端用户的唯一交互入口，目标用户为非程序员，通过 AI 对话驱动所有操作。

架构总览：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Desktop Client (Electron + React)                 │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────────┐  │
│  │ AI 对话   │  │ 选币管理      │  │ 策略管理    │  │ 回测展示    │  │
│  │ 面板(右侧)│  │              │  │            │  │            │  │
│  └─────┬────┘  └──────┬───────┘  └─────┬──────┘  └─────┬──────┘  │
│        │              │                │               │          │
│        ▼              │                │               │          │
│  ┌──────────┐         │                │               │          │
│  │ LLM 适配层│         │                │               │          │
│  │ 5家API   │         │                │               │          │
│  └──────────┘         │                │               │          │
│                       │                │               │          │
│  ┌────────────────────┴────────────────┴───────────────┴────────┐ │
│  │                    本地 SQLite                                │ │
│  │  strategies | conversations | backtest_results | coin_lists  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Remote API Client                          │  │
│  │  backtest-engine :8081   |   data-aggregator :8080           │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │                                │
         ▼                                ▼
  ┌──────────────┐                ┌───────────────┐
  │ 5家 LLM API  │                │ Remote Server │
  │ (用户自带Key) │                │ backtest/data │
  └──────────────┘                └───────────────┘
```

## Goals / Non-Goals

**Goals:**

- 非程序员用户通过自然语言即可完成选币、策略生成、回测的全流程
- 支持 5 家主流 LLM（OpenAI, Claude, DeepSeek, Gemini, Kimi），用户自带 API Key
- AI 对话支持迭代优化：回测结果自动注入上下文，AI 根据结果改进策略
- 预回测（1 周）+ 深度回测（半年）两阶段流程
- 专业级回测结果展示：K线图信号标注、权益曲线、回撤曲线、月度热力图
- 本地策略管理：版本链、收藏、有效/无效状态
- 跨平台：macOS + Windows

**Non-Goals:**

- 多用户/登录认证 —— 单用户 MVP
- 实盘交易 —— 后续独立功能
- API Key 加密存储 —— 用户自托管，暂不加密
- 移动端 —— 仅桌面
- 离线 AI（本地模型） —— 仅支持在线 API
- 数据归集管理界面 —— 数据同步由后端自动处理

## Decisions

### Decision 1: 技术栈 — Electron + React

**选择**: Electron 28+ 搭配 React 18 + TypeScript

**替代方案**:
- A) Tauri + React：包体小，但 Rust 后端增加开发复杂度，SQLite 绑定需要额外工作
- B) Flutter Desktop：跨平台一致，但金融图表生态弱，Dart 社区小
- C) 原生 Swift/Kotlin：体验最好，但不跨平台

**理由**: Electron 生态最成熟，npm 包丰富（TradingView Lightweight Charts、better-sqlite3、各 LLM SDK 均有 JS 包）。开发效率高。缺点（包体大、内存高）对桌面量化工具可接受。

### Decision 2: LLM 适配层 — 3 种适配器覆盖 5 家

**选择**: 统一 Chat Interface，底层 3 种适配器

| 适配器 | 覆盖 | SDK/方式 |
|--------|------|----------|
| OpenAI Compatible | OpenAI, DeepSeek, Kimi | openai npm 包，改 baseURL |
| Anthropic | Claude | @anthropic-ai/sdk |
| Google Generative AI | Gemini | @google/generative-ai |

DeepSeek（api.deepseek.com）和 Kimi（api.moonshot.cn）兼容 OpenAI API 格式，只需修改 `baseURL` 和 `model`。

**统一接口**:
```typescript
interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface LLMAdapter {
  stream(messages: ChatMessage[], onChunk: (text: string) => void): Promise<string>
}
```

### Decision 3: AI 对话模式 — 统一对话 + 上下文自动注入

**选择**: 全局一个连续对话面板，常驻右侧。AI 根据当前上下文自动注入相关信息。

**上下文注入策略**:
- 触发回测结果优化时：自动注入 核心指标 + 亏损最大 5 笔交易 + 连续亏损段 + 多空对比 + 当前代码
- 选币时：注入当前选币列表
- 策略生成时：注入 Strategy 基类规范 + 可用指标列表

**上下文裁剪**: 旧对话压缩为摘要，保持 token 预算在模型上限的 70% 以内。

**替代方案**:
- 独立对话（选币一个、策略一个）：更简单但 AI 缺少全局上下文，用户需要切换

### Decision 4: App 布局 — 左侧主内容 + 右侧 AI 面板

**选择**:
```
┌────────────────────────────────────┬──────────────────────┐
│          主内容区                   │    AI 对话面板       │
│  Tab: [选币] [策略] [回测]         │    (常驻右侧)        │
│                                    │    宽度可拖拽        │
│  根据 Tab 切换展示内容              │    可折叠            │
└────────────────────────────────────┴──────────────────────┘
```

**理由**: 参考 Cursor / GitHub Copilot Chat 的设计范式 —— AI 对话与工作区并排。用户左边看数据/图表，右边和 AI 交流，无需切换上下文。

### Decision 5: 本地存储 — SQLite (better-sqlite3)

**选择**: Electron main process 中使用 better-sqlite3 管理本地数据

**数据表设计**:

```sql
-- 策略存储
CREATE TABLE strategies (
    id          TEXT PRIMARY KEY,   -- UUID
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,      -- 'strategy' | 'screener'
    code        TEXT NOT NULL,
    description TEXT,               -- AI 生成的策略摘要
    status      TEXT DEFAULT 'active', -- 'active' | 'inactive'
    is_favorite INTEGER DEFAULT 0,
    tags        TEXT,               -- JSON array
    version     INTEGER DEFAULT 1,
    parent_id   TEXT,               -- 版本链
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- 对话记录
CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT,
    messages    TEXT NOT NULL,      -- JSON array [{role, content, ts}]
    strategy_id TEXT,               -- 关联策略
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- 回测结果缓存
CREATE TABLE backtest_results (
    id                TEXT PRIMARY KEY,
    strategy_id       TEXT NOT NULL,
    type              TEXT NOT NULL,   -- 'preview' | 'full'
    symbols           TEXT NOT NULL,   -- JSON array
    config            TEXT NOT NULL,   -- JSON
    summary_metrics   TEXT,            -- JSON 组合汇总指标
    per_symbol_metrics TEXT,           -- JSON {symbol: metrics}
    equity_curve      TEXT,            -- JSON 时间序列
    trades            TEXT,            -- JSON 交易列表
    remote_task_id    TEXT,
    created_at        TEXT DEFAULT (datetime('now'))
);

-- 选币列表
CREATE TABLE coin_lists (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    symbols     TEXT NOT NULL,      -- JSON array
    screener_id TEXT,               -- 关联选币策略
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- 设置
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### Decision 6: K线图表 — TradingView Lightweight Charts

**选择**: 使用 TradingView 开源的 Lightweight Charts 库

**理由**: 免费开源（Apache 2.0），专为金融数据设计，支持 K线图 + 指标线叠加 + markers（信号标注）。包体小（~40KB gzip），性能好（Canvas 渲染）。

**信号标注方案**:
- Markers API：在 K 线上添加 ▲（做多开仓，绿色）、▼（做空开仓，红色）、●（平仓，盈利绿/亏损红）
- Line Series：叠加 SMA/EMA 等指标线
- 副图：RSI、MACD 等独立坐标的指标

### Decision 7: 两阶段回测 — 预回测 + 深度回测

**选择**: 预回测（最近 1 周）快速验证 → 深度回测（默认半年）完整评估

**流程**:
1. 预回测：选中所有币种 × 最近 1 周数据，远程执行，~秒级返回
2. 展示预回测结果：K线图 + 信号标注 + 简要指标 + 交易列表
3. 用户确认信号点位合理 → 点击"深度回测"
4. 深度回测：选中所有币种 × 默认半年，远程执行，~分钟级
5. 展示完整结果：组合汇总 + 单币种详情

**预回测结果从远程 API 获取，使用与深度回测相同的 endpoint**，仅 `from/to` 参数不同。

### Decision 8: 回测结果展示 — 组合汇总 + 单币种下钻

**选择**: 两层展示

**第一层（组合汇总）**:
- 核心指标卡片（总收益、年化、夏普、回撤、胜率、交易数）
- ALL/LONG/SHORT 维度切换
- 组合权益曲线 + 回撤曲线
- 各币种表现排名表（可按指标排序）
- 月度收益热力图
- 全部交易列表（可按币种/方向筛选）

**第二层（单币种详情）**:
- 该币种 K 线图 + 信号标注 + 指标线
- 该币种权益曲线 + 回撤曲线
- 该币种指标卡片
- 该币种交易列表（点击某笔交易 → K线图定位到该时间段）

### Decision 9: AI 自动优化 — 上下文构造策略

**选择**: 回测完成后，用户可点击「AI 优化」或自然语言要求优化。系统自动构造优化上下文。

**上下文构造规则**:
```
[System Prompt]: Strategy 基类规范 + 优化器角色

[自动注入]:
- 当前策略代码 (完整)
- 核心指标 (ALL/LONG/SHORT)
- 最差表现币种 (bottom 3)
- 亏损最大 5 笔交易 (含入出场时间、价格、收益)
- 连续亏损段 (位置和长度)
- 多空对比数据
- 月度收益分布

[用户消息]: "帮我优化" 或具体指令
```

裁剪策略：不发送全部交易列表（可能 500+笔），只发送统计摘要和关键交易。控制注入上下文在 ~2000 tokens。

### Decision 10: 项目结构

```
desktop-client/
├── electron/
│   ├── main.ts              # Electron 主进程
│   ├── preload.ts           # 预加载脚本
│   └── ipc/                 # IPC 通信处理
│       ├── llm.ts           # LLM 调用
│       ├── db.ts            # SQLite 操作
│       └── remote.ts        # 远程 API 调用
├── src/                     # React 渲染进程
│   ├── App.tsx
│   ├── components/
│   │   ├── chat/            # AI 对话面板
│   │   ├── screening/       # 选币管理
│   │   ├── strategy/        # 策略管理
│   │   ├── backtest/        # 回测结果展示
│   │   ├── charts/          # K线图/权益曲线/热力图
│   │   └── common/          # 通用组件
│   ├── stores/              # 状态管理 (zustand)
│   ├── services/
│   │   ├── llm/             # LLM 适配层
│   │   │   ├── types.ts
│   │   │   ├── openai-adapter.ts
│   │   │   ├── anthropic-adapter.ts
│   │   │   └── google-adapter.ts
│   │   ├── prompt/          # Prompt 模板管理
│   │   ├── remote-api.ts    # 远程 backtest-engine 客户端
│   │   └── context-builder.ts  # AI 上下文构造
│   ├── hooks/
│   └── utils/
├── package.json
├── electron-builder.yml     # 打包配置
├── vite.config.ts
└── tsconfig.json
```

## Risks / Trade-offs

**[Electron 包体大 ~150MB]** → 对桌面量化工具可接受。未来如有需要可考虑迁移 Tauri。

**[LLM 代码生成质量不稳定]** → 不同模型生成的代码质量差异大。需要精心设计 system prompt，并在前端做基本的代码格式校验（检查是否包含 class 定义、是否继承正确基类）。生成失败时引导用户换模型或重述需求。

**[上下文 token 消耗]** → 长对话 + 回测结果注入可能接近模型 context 上限。通过上下文压缩（旧消息摘要化）和回测结果裁剪控制。对 Kimi（128k context）影响小，对 GPT-4o（128k）也够用。

**[远程服务不可用时的体验]** → 回测依赖远程服务。需要友好的错误提示和连接状态指示。策略编写和管理在本地可离线进行，仅回测执行需要联网。

**[预回测和深度回测的数据一致性]** → 预回测用最近 1 周，深度回测用半年，策略在两个尺度上表现可能差异大。这是正常的，但需要在 UI 上明确提示用户两者的区别。

**[多币种回测结果数据量]** → 12 个币种 × 半年 × 1h ≈ 52k bars × 12 = 624k 数据点。权益曲线和交易列表可能较大。本地 SQLite 存储无压力，但从远程传输需注意响应体大小（~MB 级，可接受）。
