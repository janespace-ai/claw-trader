## 1. Prereqs

- [x] 1.1 `api-contract-new-capabilities` + `backtest-engine-align-contract` landed.

## 2. Store queries

- [x] 2.1 `internal/store/symbol_metadata.go`:
  - `SymbolRow(ctx, symbol) (rank, volume24h, status, market, error)` — row from `claw.symbols`
  - `LastKlineInfo(ctx, symbol) (firstTs, lastTs, lastPrice, error)` — one SELECT over `futures_1h`, fallback to `futures_5m` if 1h empty
  - `CloseAtOrBefore(ctx, symbol, ts) (price, found, error)` — for 24h comparison
- [x] 2.2 Unit tests with seeded data covering normal + empty + < 24h cases.

## 3. Handler

- [x] 3.1 `internal/handler/symbol_metadata.go`:
  - Parse + uppercase path param
  - Pattern-check with regex `^[A-Z0-9_]+$`
  - If not match → 400 INVALID_SYMBOL
  - Query SymbolRow; if not found → 404 SYMBOL_NOT_FOUND
  - Query LastKlineInfo; if present, compute 24h change via `CloseAtOrBefore`
  - Compose `SymbolMetadata` with null-aware fields
  - `RespondOK`

## 4. Router

- [x] 4.1 Register `GET /api/symbols/:symbol/metadata` in router.
- [x] 4.2 Hertz path param handling — confirm `{symbol}` correctly URL-decodes before reaching handler.

## 5. Name derivation

- [x] 5.1 `name = strings.TrimSuffix(symbol, "_USDT")`. If the strip produces empty string, fallback to `symbol` as-is.

## 6. Tests

- [x] 6.1 `handler/symbol_metadata_test.go`:
  - Happy path: full metadata returned
  - Missing symbol: 404
  - Registered but no data: 200 with nulls
  - < 24h data: 200 with change_24h_pct null
  - Lowercase input: normalized + returns
  - Bad pattern: 400
- [x] 6.2 Contract test ensures response matches openapi schema.

## 7. Final validation

- [x] 7.1 `go test ./...` green.
- [x] 7.2 Manual: `curl http://localhost:8081/api/symbols/BTC_USDT/metadata | jq` against real backend with populated data.
- [x] 7.3 Frontend (Symbol Detail topbar from UI change #9) renders real values.
