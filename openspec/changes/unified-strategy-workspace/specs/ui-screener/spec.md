# ui-screener (delta)

## REMOVED Requirements

### Requirement: 选币 Top-Level Tab
**Reason**: Tab structure changes to `创建/编辑策略 | 策略库 | settings`.
The 选币 entry in navigation is deleted; route `kind: 'screener'` is
removed from `AppRoute`.
**Migration**: Any persisted last-route pointing to 'screener' is
silently mapped to the new front-door tab on first launch after this
change ships.

### Requirement: ScreenerScreen Layout
**Reason**: The screen is deleted entirely.  Its functions (running a
filter, showing pass/fail, focusing chart on a symbol) move into the
unified workspace where they read from the active strategy's
draft_symbols.

### Requirement: Watchlist of Pass / Fail Symbols
**Reason**: The pass/fail dichotomy is collapsed to "the strategy's
universe" (draft_symbols).  Failed symbols from the screener run are
not retained; only the passing array is stored.
