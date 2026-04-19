## Why

Contract defines `GET /api/symbols/{symbol}/metadata` — a bundle endpoint that returns name + last_price + 24h change + rank + kline coverage range, used by Symbol Detail page header and Strategy Management's card subtitles. Currently unimplemented.

Small, isolated change.

## What Changes

**New handler** `GET /api/symbols/{symbol}/metadata`:
- Query `claw.symbols` table for rank + volume_24h_quote + status
- Query `claw.futures_1h` (or lowest available interval) for `MIN(ts)` → `first_kline_at`, `MAX(ts)` → `last_kline_at`, last row's `close` → `last_price`
- Compute `change_24h_pct`:
  - Fetch the close 24h before `last_kline_at`
  - `(last_price - close_24h_ago) / close_24h_ago * 100`
- `name`: currently equals `symbol.TrimSuffix("_USDT")`; future enhancement may map to a curated names table
- Response matches `SymbolMetadata` schema in contract

**Path validation**: path param `symbol` pattern `^[A-Z0-9_]+$` — reject anything else with 400.

**Error codes**:
- `SYMBOL_NOT_FOUND` — symbol not in `claw.symbols`
- `INVALID_SYMBOL` — pattern violation

**Special case**: symbol exists but no K-line data yet → return 200 with `last_price=null, change_24h_pct=null, first_kline_at=null, last_kline_at=null`. Frontend renders "—" placeholders.

## Capabilities

### New Capabilities
*(None.)*

### Modified Capabilities
- `backtest-data-gateway`: Adds the metadata endpoint impl.

## Impact

**New files**
- `backtest-engine/internal/handler/symbol_metadata.go`
- `backtest-engine/internal/handler/symbol_metadata_test.go`
- `backtest-engine/internal/store/symbol_metadata.go` — query helpers

**Modified files**
- `backtest-engine/internal/router/router.go` — register route
- `backtest-engine/internal/model/symbol.go` — add `SymbolMetadata` struct

**Depends on**
- `api-contract-new-capabilities`
- `backtest-engine-align-contract`

**Out of scope**
- Curated symbol name lookups (e.g. "BTC" → "Bitcoin" — would require a static names table)
- Rich metrics like market cap, supply (out of our data scope)
- Historical metadata queries (`metadata?at=2024-01-01`) — current only
