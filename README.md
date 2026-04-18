# claw-trader

**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> A research-first quant platform for everyday users. Write a strategy, backtest it against real historical market data, and see whether the idea actually holds up — all running on your own machine.

<p align="center">
  <img src="docs/screenshots/multi-symbol-grid-light.png" alt="Multi-symbol grid view — nine mini equity curves, one screen" width="860">
</p>

<p align="center">
  <em>Multi-symbol grid: run one strategy across many markets, see equity curves and trade markers at a glance.</em>
</p>

---

## What you can do

- **Write strategies in plain Python.** Subclass `Strategy`, implement `on_bar(bar)`, call `self.buy()` / `self.sell()` / `self.close()`. No DSL to learn, no configuration cliffs.
- **Let AI draft a strategy or screener for you.** Describe the idea in natural language and get runnable Python back. Edit it, backtest it, iterate.
- **Backtest against real historical K-lines.** Hourly, 4h, daily, and more — pulled from public datasets, stored in a time-series database on your machine.
- **Screen many symbols at once.** Express a filter ("volume over $100M, trend up, RSI below 70"), see the matches ranked, drill into any of them.
- **Deep-dive one symbol.** Candles, indicators, your trade markers, equity curve, drawdown, and a full trade journal — side by side.

## What it isn't

- **Not a trading bot.** There is no live order execution. It reads historical market data and simulates strategies; it does not place real trades.
- **Not a paper-trading service.** No forward testing against live feeds yet. Backtest only.
- **Not a managed service.** Nothing runs in our cloud. There is no signup, no account, no server we control. You run the three services locally.
- **Not financial advice.** The tool shows what a strategy *would have done* on historical data. What the strategy does next is not something anyone can promise.

<p align="center">
  <img src="docs/screenshots/workspace-strategy-design-light.png" alt="Strategy design workspace — K-lines, indicators, and the AI strategist panel" width="860">
</p>

## Quick start

You need **Docker** and **Docker Compose**. Everything else is in the repo.

**1. Bring up the data aggregator + time-series database:**

```bash
cd data-aggregator
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

This downloads a small slice of historical K-lines (two symbols, two months) so you have something to backtest against immediately. A full sync takes longer — edit `config.yaml` when you're ready to scale up.

**2. Build the strategy sandbox image:**

```bash
docker build -t claw-sandbox:latest backtest-engine/sandbox/
```

The sandbox is a locked-down Python container that runs your strategy code. It ships `pandas`, `numpy`, `ta-lib`, and a bundled `claw` framework. First build takes a few minutes because it compiles the TA-Lib C library.

**3. Start the backtest engine:**

```bash
cd ../backtest-engine
docker compose up -d --build
```

**4. Launch the desktop client:**

```bash
cd ../desktop-client
pnpm install
pnpm dev
```

The Electron window opens against the two local services. Design a strategy in the left panel, hit *Run Preview*, watch the result land in the bottom drawer.

Full commands and verified overrides are in each service's own `README` (and in the proposals under `openspec/`).

## Architecture

```
  ┌───────────────────────────────┐
  │  desktop-client (Electron +   │
  │  React + TypeScript)          │
  └───────────┬───────────────────┘
              │ HTTP 8080 / 8081
     ┌────────┴─────────┐
     │                  │
     ▼                  ▼
  ┌──────────────┐   ┌─────────────────────┐
  │ data-        │   │ backtest-engine     │
  │ aggregator   │   │ (Go + Hertz)        │
  │ (Go + Hertz) │   │   │                 │
  └──────┬───────┘   │   │ spawns          │
         │           │   ▼                 │
         ▼           │ ┌─────────────────┐ │
  ┌──────────────┐◄──┘ │ Python sandbox  │ │
  │ TimescaleDB  │◄────┤ container       │ │
  │ (OHLCV)      │ R/O │ (your strategy) │ │
  └──────────────┘     └─────────────────┘ │
                                           │
  ┌─ AI (your API key) ───────────────────┐│
  │  OpenAI / Anthropic / DeepSeek /      ││
  │  Gemini / Moonshot — called from      ││
  │  the desktop client only              │◄┘
  └───────────────────────────────────────┘
```

Three services, one database, one sandbox per backtest run. The sandbox gets a read-only DB user so user-supplied Python code can query historical candles but cannot write or delete anything.

This repository uses [OpenSpec](openspec/) for proposal-driven development — every notable change has a proposal, a design doc, and a spec under `openspec/`.

<p align="center">
  <img src="docs/screenshots/deep-backtest-light.png" alt="Deep backtest view — equity curve, metrics, AI optimize panel" width="860">
</p>

## Data sources & AI providers

**Market data** is pulled from Gate.io's public historical dataset (hosted on S3) and its REST API. Both are open, no API key required. The `data-aggregator` handles the download, schema, and gap detection.

Supporting other venues (Binance, Bybit, CME, TradFi feeds) is a matter of writing another aggregator connector — the engine itself is venue-agnostic and operates on a generic `Bar(open, high, low, close, volume)` abstraction. Other connectors are not part of this release.

**AI providers** — any OpenAI-compatible endpoint works. Tested against:

- OpenAI (`gpt-4o`, `gpt-4o-mini`)
- Anthropic (`claude-*`)
- DeepSeek (`deepseek-chat`, `deepseek-reasoner`)
- Google Gemini (`gemini-*`)
- Moonshot (`kimi-*`)

You bring your own API key. It is stored locally (in the Electron app's local storage) and sent only from your machine to the provider you chose.

## Privacy

- **Your API keys live on your machine.** The desktop client stores them in its local data directory and never sends them anywhere except the provider endpoint you configured.
- **No telemetry.** There is no analytics SDK, no crash reporter, no "phone home". If the app hits the internet, it's to reach a data source or an AI provider you explicitly configured.
- **No account, no cloud sync.** Backtests, strategies, and screeners are saved in the local database you spun up. Deleting the Docker volume deletes everything.

## Tech stack

- **Languages**: Go (services), Python 3.11 (sandbox), TypeScript + React 18 (client)
- **Services framework**: [Hertz](https://github.com/cloudwego/hertz) (HTTP) on Go 1.25
- **Storage**: [TimescaleDB](https://www.timescale.com/) (Postgres + time-series extension)
- **Charting**: [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- **Indicators**: [TA-Lib](https://github.com/TA-Lib/ta-lib) inside the sandbox
- **Desktop shell**: Electron 33 + Vite + Tailwind
- **Tooling**: Docker Compose, pnpm, OpenSpec

## Project layout

```
claw-trader/
├── data-aggregator/    Go service · pulls & stores historical K-lines
├── backtest-engine/    Go service + Python sandbox · runs strategies
├── desktop-client/     Electron + React · the UI
├── design/             Pencil (.pen) mockups — dark + light themes
├── docs/screenshots/   Hero images used in this README
├── openspec/           Proposals, designs, specs — the how and why
└── LICENSE             MIT
```

## Contributing

PRs are welcome. For anything non-trivial, please open an issue (or a proposal under `openspec/`) first so we can agree on the approach before code gets written. Small fixes — typos, docs, obvious bugs — just send the PR.

## Status

Early alpha. The three services work end-to-end and the desktop client renders the full flow, but APIs and database schemas may still change as the spec catalogue settles. Pin to a tag if stability matters to you.

## Disclaimer

This project is a research and educational tool. It does not execute trades. Nothing in this repository constitutes financial, investment, legal, or tax advice. Historical backtest results do not predict future returns, and a strategy that looks profitable in a backtest can lose money when applied to live markets for reasons the backtest cannot model (slippage, liquidity, regime change, data quality, and the user's own behaviour). You are solely responsible for complying with the laws and regulations of your jurisdiction when using any data source or integrating with any third-party service referenced by this software.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 janespace.
