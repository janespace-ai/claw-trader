# claw-trader

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> 一套給一般使用者的開源量化研究平臺。寫一條策略、用真實歷史行情回測一下、看看想法是否站得住腳——全部在你自己的電腦上執行。

<p align="center">
  <img src="docs/screenshots/multi-symbol-grid-light.png" alt="多品種網格檢視——九條小型權益曲線，一畫面看完" width="860">
</p>

<p align="center">
  <em>多品種網格：同一條策略跑在不同品種上，權益曲線與交易標記一目了然。</em>
</p>

---

## 能用它做什麼

- **直接用 Python 撰寫策略。** 繼承 `Strategy`、實作 `on_bar(bar)`、呼叫 `self.buy()` / `self.sell()` / `self.close()`。沒有自造的 DSL，也沒有「要先調好二十幾個參數才能開始」的門檻。
- **讓 AI 幫你起草策略或篩選器。** 用自然語言描述想法，直接拿到可執行的 Python 程式碼。改一改、回測、繼續迭代。
- **以真實歷史 K 線回測。** 小時線、4 小時線、日線……從公開資料集下載後，存入執行在你本機的時序資料庫。
- **一次篩一批品種。** 定義一條篩選規則（「成交額大於一億、趨勢向上、RSI 低於 70」），檢視排序後的結果，點進去深入分析。
- **單一品種深度分析。** 蠟燭圖、指標、你的交易標記、權益曲線、回撤、完整的交易日誌——並排顯示。

## 它不是什麼

- **不是交易機器人。** 沒有實盤下單。它只讀取歷史行情、模擬策略表現；不會替你送出真實委託。
- **不是模擬盤服務。** 目前沒有針對即時資料的前向測試，只做歷史回測。
- **不是託管服務。** 沒有我們的雲端、沒有註冊、沒有帳號、沒有任何由我們掌控的伺服器。三個服務皆於你本機執行。
- **不構成投資建議。** 它呈現的是策略「在歷史資料上本來會如何」，至於未來如何，並非任何人能向你保證。

<p align="center">
  <img src="docs/screenshots/workspace-strategy-design-light.png" alt="策略設計工作區——K 線、指標與 AI 策略師面板" width="860">
</p>

## 快速開始

你需要 **Docker** 與 **Docker Compose**，其餘皆在本專案之中。

**1. 啟動資料彙整器與時序資料庫：**

```bash
cd data-aggregator
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

這會先下載一小段歷史 K 線（兩個品種、兩個月份），讓你立刻有資料可以回測。待要做完整同步時再調整 `config.yaml` 擴大範圍。

**2. 建置策略沙箱映像檔：**

```bash
docker build -t claw-sandbox:latest backtest-engine/sandbox/
```

沙箱是一個受限的 Python 容器，專門執行你撰寫的策略程式碼。內建 `pandas`、`numpy`、`ta-lib`，以及打包好的 `claw` 框架。第一次建置會編譯 TA-Lib 的 C 函式庫,須稍等數分鐘。

**3. 啟動回測引擎：**

```bash
cd ../backtest-engine
docker compose up -d --build
```

**4. 開啟桌面用戶端：**

```bash
cd ../desktop-client
pnpm install
pnpm dev
```

Electron 視窗會連上本機的兩個服務。在左側面板撰寫策略、按 *Run Preview*，結果會出現在底部抽屜。

每個服務各自的 `README` 以及 `openspec/` 下的 proposal，保留有更完整的命令與驗證過的參數組合。

## 架構

```
  ┌───────────────────────────────┐
  │  desktop-client（Electron +   │
  │  React + TypeScript）         │
  └───────────┬───────────────────┘
              │ HTTP 8080 / 8081
     ┌────────┴─────────┐
     │                  │
     ▼                  ▼
  ┌──────────────┐   ┌─────────────────────┐
  │ data-        │   │ backtest-engine     │
  │ aggregator   │   │ (Go + Hertz)        │
  │ (Go + Hertz) │   │   │                 │
  └──────┬───────┘   │   │ 衍生             │
         │           │   ▼                 │
         ▼           │ ┌─────────────────┐ │
  ┌──────────────┐◄──┘ │ Python 沙箱     │ │
  │ TimescaleDB  │◄────┤ 容器            │ │
  │ (OHLCV)      │ 唯讀 │（你的策略）     │ │
  └──────────────┘     └─────────────────┘ │
                                           │
  ┌─ AI（自備 API Key）─────────────────────┐│
  │  OpenAI / Anthropic / DeepSeek /      ││
  │  Gemini / Moonshot — 僅由桌面         ││
  │  用戶端發起呼叫                       │◄┘
  └───────────────────────────────────────┘
```

三個服務、一個資料庫、每次回測各起一個沙箱。沙箱使用唯讀資料庫帳號：使用者提交的 Python 程式碼能查詢歷史 K 線,卻寫不進去、也刪不掉。

本專案使用 [OpenSpec](openspec/) 進行 proposal 驅動的開發——每個值得留下紀錄的變更，都在 `openspec/` 下有 proposal、design 與 spec。

<p align="center">
  <img src="docs/screenshots/deep-backtest-light.png" alt="深度回測檢視——權益曲線、指標、AI 最佳化面板" width="860">
</p>

## 資料來源與 AI 供應商

**行情資料**取自 Gate.io 的公開歷史資料集（託管於 S3）與公開 REST API，兩者皆無須 API Key。`data-aggregator` 負責下載、入庫與缺口偵測。

要支援其他交易所（Binance、Bybit、CME、傳統金融資料源）——僅是多寫一個彙整器連接器的事。引擎本身與交易場所解耦，面向一個通用的 `Bar(open, high, low, close, volume)` 抽象。此版本目前僅包含 Gate.io 連接器，其他連接器不在本次範圍。

**AI 供應商**——任何相容於 OpenAI 介面的服務皆可使用。已驗證的包括：

- OpenAI（`gpt-4o`、`gpt-4o-mini`）
- Anthropic（`claude-*`）
- DeepSeek（`deepseek-chat`、`deepseek-reasoner`）
- Google Gemini（`gemini-*`）
- Moonshot / 月之暗面（`kimi-*`）

API Key 由你自備。它只儲存於你本機（Electron 應用的本機儲存中），僅會從你的機器發送至你自行選定的服務商。

## 隱私 / 本地執行

- **API Key 僅存於你的電腦。** 桌面用戶端將其存放於本機資料目錄，除了你自行設定的服務商之外，不會送往任何其他地方。
- **不收集遙測資料。** 沒有分析 SDK、沒有錯誤回報、沒有任何「偷偷回報」的呼叫。應用程式會連上網路的情況，只有你自行設定的資料來源或 AI 服務。
- **沒有帳號，沒有雲端同步。** 回測、策略、篩選器都存在你本機啟動的資料庫中。刪除 Docker volume 就一切清空。

## 技術堆疊

- **語言**：Go（服務）、Python 3.11（沙箱）、TypeScript + React 18（用戶端）
- **服務框架**：[Hertz](https://github.com/cloudwego/hertz)（HTTP）搭配 Go 1.25
- **儲存**：[TimescaleDB](https://www.timescale.com/)（PostgreSQL + 時序擴充套件）
- **圖表**：[TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- **指標**：沙箱中的 [TA-Lib](https://github.com/TA-Lib/ta-lib)
- **桌面殼**：Electron 33 + Vite + Tailwind
- **工具鏈**：Docker Compose、pnpm、OpenSpec

## 目錄結構

```
claw-trader/
├── data-aggregator/    Go 服務 · 下載並儲存歷史 K 線
├── backtest-engine/    Go 服務 + Python 沙箱 · 執行策略
├── desktop-client/     Electron + React · UI
├── design/             Pencil (.pen) 設計稿 — 深色與淺色主題
├── docs/screenshots/   README 所用的展示圖
├── openspec/           Proposal、design、spec — 為什麼與怎麼做
└── LICENSE             MIT
```

## 貢獻

歡迎提交 PR。若不是一眼看得完的小改動，請先開一個 issue（或於 `openspec/` 放上一份 proposal），先就方向達成共識再動手。純粹的錯字、文件、明顯的 bug——直接送 PR 即可。

## 專案狀態

早期 alpha。三個服務能跑通完整流程、桌面用戶端能呈現完整回測流程，但 API 與資料庫 schema 仍會隨著 spec 目錄收斂而調整。若在意穩定性，請以 tag 固定版本。

## 免責聲明

本專案為研究與教育用途之工具，不執行任何交易。本倉庫之內容不構成金融、投資、法律或稅務建議。歷史回測結果不能預測未來收益；在回測中看似獲利的策略，於實盤運行時仍可能虧損，原因包括但不限於：滑點、流動性、市場狀態切換、資料品質、以及使用者本身的行為——這些都是回測模型無法完整刻畫的因素。使用本軟體所涉及的任何資料來源或第三方服務時,使用者須自行遵守所在地之法律與法規,相關合規責任由使用者自負。

## 授權

以 [MIT License](LICENSE) 釋出。版權所有 (c) 2026 janespace。
