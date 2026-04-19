## Context

Aggregator already populates `claw.symbols` (rank, volume_24h_quote) and `claw.futures_<interval>` (price data). The endpoint is just an aggregation query over these two sources.

## Goals / Non-Goals

**Goals:**
- Endpoint serves in < 100ms (two cheap queries).
- Handles "symbol registered but no data yet" cleanly with nulls.
- Path-param validation prevents injection.

**Non-Goals:**
- Name translation (BTC → Bitcoin).
- Historical snapshots.
- Chain-wide market data.

## Decisions

### D1. 24h change computation: by timestamp, not by row index

**Decision.** Fetch the close at `last_kline_at - 24h` via:

```sql
SELECT close FROM claw.futures_1h
WHERE symbol = $1 AND ts <= $2 - INTERVAL '24 hours'
ORDER BY ts DESC LIMIT 1;
```

This tolerates data gaps — uses the most recent available close before the 24h mark.

If no row exists (symbol too new, < 24h of data), `change_24h_pct = null`.

### D2. last_price from most recent row, not computed

**Decision.** Use the last 1h close as `last_price`. Not the 5m close (less stable), not a weighted average (unnecessary complexity).

### D3. Symbol normalization

**Decision.** Path param converted to uppercase before DB lookup. Reject if contains lowercase → 400 `INVALID_SYMBOL` with a hint to use uppercase (or auto-uppercase? decide: auto-normalize, no error). Going with auto-normalize: `BTC_usdt` → `BTC_USDT`, no error.

Hyphens / spaces still rejected.

### D4. Empty data path returns 200, not 404

**Decision.** If symbol is in `claw.symbols` but has no klines yet, return 200 with nulls for price fields. Distinguishes "symbol doesn't exist" (404) from "symbol exists but freshly added" (200 + nulls). Frontend can render appropriately.

## Risks / Trade-offs

- **[Two round-trips to DB]** → Can be combined into one SQL with a CTE + JOIN if needed. Premature optimization for now.

- **[Aggregator might not have 1h data but has 5m data]** → Fall back to 5m table if 1h is empty. Code: try `futures_1h` first; if no rows, try `futures_5m`. Implementation detail; document in tasks.

- **[Symbol with _USDT substring might be misleading for name]** → `name = trimSuffix` is dumb but honest. Users who care can add a name field to `claw.symbols` via a future migration.

## Migration Plan

Additive endpoint. No DB changes.

## Open Questions

- Should `name` be a separate column on `claw.symbols` we populate from a dict? → Future work; not in this change.
- Should the endpoint support batch (`GET /api/symbols/metadata?symbols=BTC_USDT,ETH_USDT`) for the Strategy Management card rendering? → Future enhancement. Start with single.
