# Error code dictionary

All HTTP 4xx / 5xx responses from the backend follow the canonical envelope:

```json
{
  "error": {
    "code": "<ErrorCode>",
    "message": "<human readable>",
    "details": { ... }
  }
}
```

`code` is one of the enum values below. `message` is English text suitable
for logs; UIs should branch on `code` and render localized strings via i18n
keyed by the code (e.g. `error.INVALID_INTERVAL`).

Adding a code is safe. Removing or renaming is breaking — coordinate across
backend + frontend + tests.

---

## `INVALID_INTERVAL`

Query/body param `interval` is not one of the supported enum values.

- HTTP: `400`
- `details.allowed_intervals: string[]` — the valid set (`["5m","15m","30m","1h","4h","1d"]`)
- UI: inline form error listing allowed values

## `INVALID_SYMBOL`

Symbol format is malformed (e.g. contains non-`[A-Z0-9_]` characters) **or**
one or more symbols in a multi-symbol request are not registered.

- HTTP: `400`
- `details.invalid_symbols: string[]` — the offending symbols
- UI: toast showing which symbols are rejected; form resets those fields

## `INVALID_RANGE`

`from > to`, `from` in the future, range exceeds allowed window, or mode +
explicit lookback are mutually conflicting.

- HTTP: `400`
- `details.reason: string`, optional `details.from: integer`, `details.to: integer`
- UI: form-level error

## `SYMBOL_NOT_FOUND`

A single-symbol endpoint was asked about a symbol that does not exist in
`claw.symbols`. (Different from `INVALID_SYMBOL` which covers the batch
request case.)

- HTTP: `404`
- `details.requested: string`
- UI: empty-state screen; "go back" action

## `STRATEGY_NOT_FOUND`

Strategy ID not in `claw.strategies`.

- HTTP: `404`
- `details.id: string`
- UI: redirect or empty-state

## `STRATEGY_VERSION_NOT_FOUND`

*(Not in this change — lands with `api-contract-new-capabilities`.)*

Strategy exists but the referenced version does not.

- HTTP: `404`
- `details.strategy_id: string`, `details.version: integer`
- `details.current_version: integer` — helpful context

## `BACKTEST_NOT_FOUND`

Backtest task_id does not exist (never created, or garbage-collected).

- HTTP: `404`
- `details.task_id: string`

## `SCREENER_NOT_FOUND`

Screener task_id does not exist.

- HTTP: `404`
- `details.task_id: string`

## `TASK_NOT_FOUND`

Generic fallback when a task ID isn't specifically a backtest or screener
(e.g. analysis tasks from the follow-up change).

- HTTP: `404`
- `details.task_id: string`, `details.kind: string`

## `COMPLIANCE_FAILED`

Submitted Python code violates the sandbox compliance checks (forbidden
imports / builtins).

- HTTP: `400`
- `details.violations: string[]` — one per violation, e.g. `"forbidden import: os"`
- UI: show violations list inline under the code editor

## `SANDBOX_ERROR`

Python sandbox crashed during execution (unhandled exception, memory limit,
syntax error not caught by compliance).

- HTTP: `500` (or manifest as `TaskResponse.status=failed`)
- `details.logs: string[]` — last ~50 lines of stderr
- `details.phase: string` — which phase the crash happened in

## `SANDBOX_TIMEOUT`

Sandbox exceeded its hard timeout (default 30 minutes per backtest task).

- HTTP: `500` or task-failed
- `details.timeout_sec: integer`

## `DATA_UNAVAILABLE`

One or more symbols lack K-line data in the requested range.

- HTTP: `400`
- `details.missing: [{ symbol, missing_range: { from, to } }]`

## `RATE_LIMITED`

Backend has applied a rate limit (not yet implemented; reserved for future).

- HTTP: `429`
- `details.retry_after_sec: integer`

## `UPSTREAM_UNREACHABLE`

A dependency (Timescale, data-aggregator health probe, LLM provider
reachability) could not be reached.

- HTTP: `503`
- `details.service: "timescale" | "aggregator" | "llm"`

## `INTERNAL_ERROR`

Generic fallback for unclassified failures. Frontend should log and show a
generic "Something went wrong" message.

- HTTP: `500`
- `details.legacy_payload: any` — if this is an adapter-translated legacy
  error, the raw payload is attached for debugging
