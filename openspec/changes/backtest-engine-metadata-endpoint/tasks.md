## 1. Prereqs

- [ ] 1.1 `api-contract-new-capabilities` + `backtest-engine-align-contract` landed.

## 2. Store queries

- [ ] 2.1 `internal/store/symbol_metadata.go`:
  - `SymbolRow(ctx, symbol) (rank, volume24h, status, market, error)` — row from `claw.symbols`
  - `LastKlineInfo(ctx, symbol) (firstTs, lastTs, lastPrice, error)` — one SELECT over `futures_1h`, fallback to `futures_5m` if 1h empty
  - `CloseAtOrBefore(ctx, symbol, ts) (price, found, error)` — for 24h comparison
- [ ] 2.2 Unit tests with seeded data covering normal + empty + < 24h cases.

## 3. Handler

- [ ] 3.1 `internal/handler/symbol_metadata.go`:
  - Parse + uppercase path param
  - Pattern-check with regex `^[A-Z0-9_]+$`
  - If not match → 400 INVALID_SYMBOL
  - Query SymbolRow; if not found → 404 SYMBOL_NOT_FOUND
  - Query LastKlineInfo; if present, compute 24h change via `CloseAtOrBefore`
  - Compose `SymbolMetadata` with null-aware fields
  - `RespondOK`

## 4. Router

- [ ] 4.1 Register `GET /api/symbols/:symbol/metadata` in router.
- [ ] 4.2 Hertz path param handling — confirm `{symbol}` correctly URL-decodes before reaching handler.

## 5. Name derivation

- [ ] 5.1 `name = strings.TrimSuffix(symbol, "_USDT")`. If the strip produces empty string, fallback to `symbol` as-is.

## 6. Tests

- [ ] 6.1 `handler/symbol_metadata_test.go`:
  - Happy path: full metadata returned
  - Missing symbol: 404
  - Registered but no data: 200 with nulls
  - < 24h data: 200 with change_24h_pct null
  - Lowercase input: normalized + returns
  - Bad pattern: 400
- [ ] 6.2 Contract test ensures response matches openapi schema.

## 7. Final validation

- [ ] 7.1 `go test ./...` green.
- [ ] 7.2 Manual: `curl http://localhost:8081/api/symbols/BTC_USDT/metadata | jq` against real backend with populated data.
- [ ] 7.3 Frontend (Symbol Detail topbar from UI change #9) renders real values.
