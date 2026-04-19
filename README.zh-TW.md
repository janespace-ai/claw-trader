# claw-trader

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **讓一般使用者也能以 AI 撰寫量化策略的開源研究平臺。** 用自然語言描述想法,讓 AI 把它轉成程式碼,觀察它在真實歷史行情下本來會是什麼表現——全部在你自己的電腦上執行。

<p align="center">
  <img src="docs/screenshots/workspace-strategy-design-light.png" alt="策略設計工作區——K 線、指標與右側的 AI 策略師面板" width="860">
</p>

<p align="center">
  <em>右側是 AI 策略師,你說想法、它寫程式碼。按一下 Run,看它在歷史上本來會是什麼樣。</em>
</p>

---

## 大致怎麼用

```
  1. 說出你的想法                 2. AI 草擬策略                  3. 跑歷史回測
  ───────────────────────         ───────────────────────         ───────────────────────
  「BTC 1 小時 K 線 RSI           編輯器自動產生 Python           以數年真實歷史資料回跑,
   跌破 30 就買進,第一根           程式碼,想改就改,              檢視收益、Sharpe、回撤、
   陰線就平倉」                   直接按 Run                      每一筆交易的明細
```

反覆迭代,直到數字讓你覺得「這條策略值得以真金白銀嘗試」。**實盤下單在路線圖上,目前版本僅做回測。**

## 不會寫程式也沒關係

> **不會寫程式?沒關係。** 用自然語言告訴 AI 你想要什麼——*「RSI 上穿 30 就買進,下一根陰線就平倉」*——它會給你一條可執行的策略。好奇的話可以看一下生成的 Python,不看也行。

## 能用它做什麼

- **和 AI 對話,取得一條策略。** 用自然語言描述想法,AI 策略師幫你寫程式碼。不滿意就改提示詞、重新生成,反覆迭代。
- **觀察它在歷史上本來會是什麼樣。** 以數年真實歷史行情回跑策略。收益指標、交易日誌、權益曲線、回撤——一畫面看完。
- **一次比較多個品種。** 寫一條篩選規則(「成交額大於一億、趨勢向上、RSI 低於 70」),檢視排序後的結果,點進去深入分析。
- **一切都在你自己的電腦上。** 沒有雲端帳號、沒有資料上傳、沒有遙測。API Key 和結果不會離開你的筆記型電腦。

*已經熟悉 Python?* 你也可直接修改 AI 產生的程式碼、或從零手動撰寫——`Strategy` 類別是純 Python,實作 `on_bar` 方法,呼叫 `buy` / `sell` / `close` 即可。

## 它不是什麼

- **暫時還不是交易機器人。** 實盤下單功能規劃中(見下方),目前尚未實裝。當前版本僅讀取歷史行情、只做模擬回測。
- **不是模擬盤服務。** 目前不做即時資料的前向測試。
- **不是託管服務。** 沒有我們的雲端、沒有註冊、沒有帳號、沒有任何由我們掌控的伺服器。三個服務皆於你本機執行。
- **不構成投資建議。** 回測中表現良好的策略,實盤仍可能虧損。

**接下來要做的:** 對接支援的交易所進行實盤下單、以即時資料做模擬盤、以及更多資料連接器。這是路線圖,並非承諾——正在設計中的功能請見 `openspec/` 下的 proposal。

## 快速開始

你需要 **Docker** 與 **Docker Compose**,其餘都在本專案之中。

**1. 啟動資料服務與時序資料庫:**

```bash
cd data-aggregator
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

首次啟動會下載一小段歷史 K 線,讓你立刻有資料可以回測。

**2. 建置策略沙箱映像檔(首次執行,須編譯數分鐘):**

```bash
docker build -t claw-sandbox:latest backtest-engine/sandbox/
```

**3. 啟動回測引擎:**

與步驟 1 共用同一 TimescaleDB（共享 Docker 網路 `claw-net` / `claw-sandbox-net`）。若只啟動 `backtest-engine`，請先在儲存庫根目錄執行 `make db-up` 以啟動資料庫。

```bash
cd ../backtest-engine
docker compose up -d --build
```

**4. 開啟桌面用戶端:**

```bash
cd ../desktop-client
pnpm install
pnpm dev
```

應用會連上本機的兩個服務。首次啟動會要求你填入 AI API Key——OpenAI、Anthropic、DeepSeek、Gemini、Moonshot(月之暗面)任選其一,貼上後就可以請 AI 幫你寫策略了。

<p align="center">
  <img src="docs/screenshots/multi-symbol-grid-light.png" alt="多品種網格檢視——九條小型權益曲線,一畫面看完" width="860">
</p>

<p align="center">
  <em>一次篩選多個品種。找出值得深入分析的幾個。</em>
</p>

## 架構

*給想深入研究的開發者。一般使用者可以跳過。*

```
  ┌───────────────────────────────┐
  │  desktop-client(Electron +   │
  │  React + TypeScript)         │
  └───────────┬───────────────────┘
              │ HTTP 8081
              ▼
              ┌─────────────────────────┐
              │ backtest-engine         │
              │ (Go + Hertz)            │
              │  • /api/backtest/*      │
              │  • /api/screener/*      │
              │  • /api/klines /symbols │
              │    /gaps(資料閘道)     │
              │  • 衍生 Python 沙箱     │
              └───────┬─────────────────┘
                      │ SQL(唯讀)
                      ▼
              ┌──────────────┐
              │ TimescaleDB  │ ◄── SQL(寫入)
              │ (OHLCV)      │      │
              └──────────────┘      │
                                    │
              ┌─────────────────────┴───┐
              │ data-aggregator         │
              │ (Go,無頭 worker)       │
              │  • 啟動即刷新 top 300   │
              │  • 偵測資料缺口         │
              │  • S3 + API 補齊        │
              │  • 不對外提供 HTTP API  │
              └─────────────────────────┘
                      ▲
                      │ S3 CSV + REST
                      │
                 Gate.io 公開資料

  ┌─ AI(自備 API Key)─────────────────────┐
  │  OpenAI / Anthropic / DeepSeek /      │
  │  Gemini / Moonshot — 僅由桌面         │
  │  用戶端發起呼叫                       │
  └───────────────────────────────────────┘
```

三個服務、一個資料庫、每次回測各起一個沙箱。`data-aggregator` 是一個**無頭 worker**:啟動時自動檢查資料完整性並補齊缺失,前端不直接存取它。`backtest-engine` 是桌面端唯一對接的入口,既負責回測編排,也兼任市場資料的唯讀閘道。沙箱使用唯讀資料庫帳號:使用者提交的 Python 程式碼能查詢歷史 K 線,卻寫不進去、也刪不掉。

本專案使用 [OpenSpec](openspec/) 進行 proposal 驅動的開發——每個值得留下紀錄的變更,都在 `openspec/` 下有 proposal、design 與 spec。

<p align="center">
  <img src="docs/screenshots/deep-backtest-light.png" alt="深度回測檢視——權益曲線、指標、AI 最佳化面板" width="860">
</p>

<p align="center">
  <em>單一品種深度分析——權益曲線、指標、完整交易日誌並排顯示。</em>
</p>

## 資料來源與 AI 供應商

**行情資料**目前來自 Gate.io 的公開歷史資料集(託管於 S3)與公開 REST API,兩者皆無須 API Key。`data-aggregator` 負責下載、入庫與缺口偵測。支援更多交易所在路線圖上——引擎本身與交易場所解耦,面向一個通用的 `Bar(open, high, low, close, volume)` 抽象。

**AI 供應商**——任何相容於 OpenAI 介面的服務皆可使用。已驗證的包括:

- OpenAI(`gpt-4o`、`gpt-4o-mini`)
- Anthropic(`claude-*`)
- DeepSeek(`deepseek-chat`、`deepseek-reasoner`)
- Google Gemini(`gemini-*`)
- Moonshot / 月之暗面(`kimi-*`)

API Key 由你自備,僅儲存於你本機。

## 隱私 / 本地執行

- **API Key 僅存於你的電腦。** 儲存在本機,只會送往你自行設定的服務商。
- **不收集遙測資料。** 沒有分析 SDK、沒有錯誤回報、沒有任何「偷偷回報」的呼叫。應用程式連上網路的情況,只有你自行設定的資料來源或 AI 服務。
- **沒有帳號,沒有雲端同步。** 回測、策略、篩選器都存在你本機啟動的資料庫中。刪除 Docker volume 就一切清空。

## 技術堆疊

- **語言**:Go(服務)、Python 3.11(策略)、TypeScript + React(用戶端)
- **儲存**:[TimescaleDB](https://www.timescale.com/)(PostgreSQL + 時序擴充套件)
- **圖表**:[TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- **指標**:[TA-Lib](https://github.com/TA-Lib/ta-lib)

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

歡迎提交 PR。若不是一眼看得完的小改動,請先開一個 issue(或於 `openspec/` 放上一份 proposal),先就方向達成共識再動手。純粹的錯字、文件、明顯的 bug——直接送 PR 即可。

## 專案狀態

**早期 alpha。** 三個服務已能跑通從 AI 寫策略到完整回測的流程,但 API 與資料庫 schema 仍會調整。若在意穩定性,請以 tag 固定版本。

## 免責聲明

本專案為研究與教育用途之工具,不執行任何真實交易。本倉庫之內容不構成金融、投資、法律或稅務建議。歷史回測結果不能預測未來收益——一個在回測中看似獲利的策略,於實盤運行時仍可能虧損,原因包括但不限於:滑點、流動性、市場狀態切換、資料品質、以及使用者本身的行為——這些都是回測模型無法完整刻畫的因素。使用本軟體所涉及的任何資料來源或第三方服務時,使用者須自行遵守所在地之法律與法規,相關合規責任由使用者自負。

## 授權

以 [MIT License](LICENSE) 釋出。版權所有 (c) 2026 janespace。
