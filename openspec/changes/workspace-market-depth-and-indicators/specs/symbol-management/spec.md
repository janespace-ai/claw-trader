# symbol-management (delta)

## ADDED Requirements

### Requirement: Symbol Schema Includes Last Price + 24h Change

The `Symbol` schema returned by `GET /api/symbols` SHALL include two
optional fields:
- `last_price?: number | null` — most recent close from the latest
  available bar.
- `change_24h_pct?: number | null` — percent change vs the close
  approximately 24 hours ago.

When the underlying data is unavailable (cold cache, symbol with no
recent bars), both fields SHALL be `null`.  Existing callers that
ignore these fields MUST continue to work unchanged.

#### Scenario: Symbol with active 1m bars

- **GIVEN** symbol BTC_USDT has bars within the last minute
- **WHEN** the client calls `GET /api/symbols`
- **THEN** the response item for BTC_USDT SHALL include
  `last_price` (a number) and `change_24h_pct` (a number).

#### Scenario: Symbol with no recent bars

- **GIVEN** symbol XYZ_USDT has no bars in the last 24h
- **WHEN** the client calls `GET /api/symbols`
- **THEN** the response item for XYZ_USDT SHALL include
  `last_price=null` and `change_24h_pct=null`.

#### Scenario: Backwards compatibility

- **GIVEN** a legacy client that doesn't read `last_price`
- **WHEN** the new server returns the enriched payload
- **THEN** the legacy client SHALL ignore the extra fields without
  error.
