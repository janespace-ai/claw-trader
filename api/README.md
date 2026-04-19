# Claw Trader API contract

Single source of truth for the HTTP surface between `desktop-client` and
`backtest-engine`. Everything in this directory is deliberately plain text
(YAML / JSON / Markdown) — no build artifacts, no generated binaries — so
PR reviewers can read it.

## Files

| File | What |
|---|---|
| `openapi.yaml` | OpenAPI 3.1 spec, machine-readable. Every endpoint. |
| `errors.md` | Narrative description of each entry in the `ErrorCode` enum. |
| `examples/*.json` | One realistic fixture per `operationId`. Used by MSW to serve mock responses and by the validator to keep the schema honest. |

## Workflow

After editing `openapi.yaml`:

```bash
cd desktop-client
pnpm api:lint      # validate openapi + every example against schema
pnpm api:types     # regenerate src/types/api.d.ts
pnpm api:mocks     # regenerate src/mocks/handlers.ts
```

Commit all three generated files alongside the openapi edit. CI (or the
local `make test-ci` target) will fail if the generated files are out of
sync with the spec.

## Adding a new endpoint

1. **Add the operation** to `openapi.yaml` under `paths:`. Minimum required:
   `operationId`, `summary`, one `response.200` (or `202`) with schema, at
   least one error response referencing `ErrorResponse`.
2. **Add an example** in `examples/<operationId>.json` with realistic data.
3. **Regenerate**: `pnpm api:types && pnpm api:mocks`.
4. **Use it**: `cremote.<operationId>({ ... })` is now typed.

## Adding a new error code

1. Append to the `ErrorCode` enum in `openapi.yaml`.
2. Add a section to `errors.md` describing: HTTP status, `details` shape,
   suggested UI presentation.
3. Add an i18n key `error.<CODE>` in the frontend locales.

## Cross-cutting conventions

- **Timestamps**: integer Unix seconds. Never ISO strings over the wire.
  Input query params still accept `YYYY-MM-DD` during the current
  transition; responses carry a `Warning: 299` header when legacy input
  is used.
- **Task envelope**: long-running ops return `TaskResponse` (see
  `components.schemas.TaskResponse`). `result` is narrowed per op; `error`
  present only on `status=failed`.
- **Error envelope**: 4xx/5xx is `{ error: { code, message, details? } }`.
- **Pagination**: cursor-based `?cursor=<opaque>&limit=<n>`; response
  includes `next_cursor: string | null`. No offset-based paging.
- **Versioning**: no URL prefix. Future breaking change = new
  `X-Claw-API-Version` header.

## Running the mock server

Frontend dev without a real backend:

```bash
cd desktop-client
pnpm dev:mock
```

This sets `VITE_USE_MOCKS=1`, which makes the renderer register the MSW
service worker before React mounts. Every `fetch('/api/*')` returns the
example from `api/examples/` of the matching `operationId`.

Three modes via `CLAW_MOCK_PROFILE`:

| Profile | Behavior |
|---|---|
| `happy` (default) | Always 200 with the committed example |
| `slow` | Same response + 500-1500ms random delay |
| `chaos` | 15% random 4xx/5xx to exercise error paths |

## Example conventions

Example files match response schemas by `operationId`, one file per
operation. Use realistic values:

- BTC price around $60k, ETH around $3k (current order of magnitude)
- Timestamps: fixed past dates (e.g. 2025-04-01 → 2026-04-01) for
  reproducibility
- UUIDs: stable strings like `00000000-0000-0000-0000-000000000001`
- Include edge cases: a candle with `qv: null`, a gap with `status:
  unrecoverable`, a failed task with `error.code: SANDBOX_TIMEOUT`
