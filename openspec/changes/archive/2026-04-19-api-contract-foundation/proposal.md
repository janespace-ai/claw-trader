## Why

The upcoming desktop-client UI refactor has to render 8 full-fidelity screens against the backend, but the current HTTP surface between `desktop-client` and `backtest-engine` is **under-specified and inconsistent**:

- Some endpoints accept ISO dates, others accept Unix seconds or `YYYY-MM-DD`; the UI has to probe.
- Error responses are ad-hoc strings (`{"error": "bad interval"}`), so the frontend can't branch on error kind — only on text.
- Long-running tasks (`backtest`, `screener`) use a "POST → poll" pattern but the envelope isn't shared; `/api/backtest/status/{id}` and `/api/screener/result/{id}` return slightly different shapes.
- The OpenAPI has never been written down, so the Go handlers and the TypeScript client are each a source of truth — and they drift.

At the same time, the UI refactor will need several **new** endpoints that don't exist yet (`/api/analysis/optimlens`, `/api/analysis/signals`, `/api/analysis/trade`, `/api/strategies/{id}/versions`, `/api/engine/status`, `/api/symbols/{s}/metadata`, multi-symbol extensions on `/api/backtest/start` and `/backtest/result`). Building those 10+ endpoints piecemeal will bake more inconsistency in.

**This change does not ship any new feature.** It establishes:
1. A single machine-readable contract file (`api/openapi.yaml`) that frontend types and mock servers are generated from.
2. Cross-cutting conventions (task envelope, error shape, error-code dictionary, pagination, timestamps) applied once, everywhere.
3. MSW-based mock infrastructure so the frontend can develop against the contract before the backend has implemented anything new.
4. Full documentation (OpenAPI + OpenSpec narrative specs) for every currently-existing endpoint, closing the drift gap.

The **new capabilities** (OptimLens, SignalReview, TradeAnalysis, Strategy versions, Engine status, multi-symbol backtest) come in the follow-up change `api-contract-new-capabilities`. This one is groundwork.

## What Changes

**New files**
- `api/openapi.yaml` — OpenAPI 3.1 spec covering every current backend endpoint, plus cross-cutting components (error envelope, task envelope, pagination).
- `api/examples/` — One realistic JSON fixture per operation (`klines.json`, `symbols.json`, `gaps.json`, `strategy.json`, `backtest-result.json`, `screener-result.json`, etc.).
- `api/errors.md` — Predefined error code dictionary (`INVALID_INTERVAL`, `SYMBOL_NOT_FOUND`, `COMPLIANCE_FAILED`, `SANDBOX_ERROR`, `TASK_NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`, ~15 codes total).
- `api/README.md` — How the contract is organized, how to regenerate types, how to run the mock server, how to propose a change.
- `desktop-client/src/types/api.d.ts` — Auto-generated TypeScript types from `api/openapi.yaml` via `openapi-typescript`. Committed so CI checks catch drift.
- `desktop-client/src/mocks/` — MSW setup: `handlers.ts` (one handler per operation, reads from `api/examples/`), `browser.ts` (for renderer/dev), `node.ts` (for Vitest).
- `desktop-client/src/services/remote/contract-client.ts` — Thin wrapper around `window.claw.remote.*` with the generated types applied; replaces the hand-rolled shapes in `client.ts` incrementally.

**Modified files**
- `desktop-client/package.json` — Add devDeps: `msw`, `openapi-typescript`. Add scripts: `api:types` (regen), `api:lint` (validate openapi), `dev:mock` (vite dev with MSW enabled).
- `desktop-client/src/main.tsx` — In dev mode OR when `VITE_USE_MOCKS=1`, start MSW worker before React renders.
- `desktop-client/vitest.config.ts` — Load MSW Node server in test setup so tests see the same fixtures as dev.
- `data-aggregator/*` and `backtest-engine/*` — **No runtime changes yet.** Both services continue to serve the same responses they do today. What changes is that they now have a written contract to compare against. Follow-up changes will tighten them to match (e.g. switch error shape, uniform timestamps).

**Conventions introduced (applies to every current + future endpoint)**

- **Task envelope** for long jobs:
  ```
  { task_id, status: "pending"|"running"|"done"|"failed"|"cancelled",
    progress?: { phase, done, total },
    result?: <op-specific>,
    error?: { code, message, details? },
    started_at, finished_at? }   // unix seconds
  ```
- **Error envelope** for 4xx/5xx:
  ```
  { error: { code, message, details? } }
  ```
- **Timestamps**: always Unix seconds (integer) over the wire. ISO only in human-facing contexts.
- **Pagination**: cursor-based — `?cursor=<opaque>&limit=<n>`, response carries `next_cursor` or `null`.
- **Versioning**: no URL prefix. Breaking changes will bump a future `X-Claw-API` header; not in scope now.

**Capabilities this change touches (by OpenSpec)**

## Capabilities

### New Capabilities
- `api-contract`: The conventions, tooling, and machine-readable schema that every other backend-facing capability must conform to. Defines task envelope, error envelope, error code registry, pagination, timestamp format, and how the OpenAPI + OpenSpec + examples artifacts stay in sync.

### Modified Capabilities
- `backtest-api`: Tightens request/response shapes to reference `api/openapi.yaml`, adopts the task envelope for `/api/backtest/status/{id}`, switches error responses to the canonical envelope, makes `config.from` / `config.to` unix-seconds-only.
- `backtest-data-gateway`: Same tightening for `/api/klines`, `/api/symbols`, `/api/gaps` — documented field types, documented error codes, `limit`/`cursor` pagination for `/api/symbols` list growth.

## Impact

**Affected code today**
- `desktop-client` gains a generated-types layer; existing `src/services/remote/client.ts` stays working during the migration (the contract client wraps, not replaces).
- `backtest-engine` runtime handlers DO NOT change in this proposal. They remain in their current drifted state and follow-up changes will tighten them per the written contract. This is intentional so the foundation can ship without coordinating a simultaneous backend PR.

**Affected code downstream (next changes, not this one)**
- `api-contract-new-capabilities` will add ~10 new operations to `api/openapi.yaml`.
- `backtest-engine` will eventually have a dedicated PR to switch error shape and timestamp format to the canonical one. That PR's acceptance test is "the OpenAPI schema validates against real responses."

**Dev workflow after this lands**
- `pnpm api:types` — regenerate `src/types/api.d.ts` after any `api/openapi.yaml` edit.
- `pnpm api:lint` — validates openapi.yaml against spec + checks every operation has an example in `api/examples/`.
- `pnpm dev:mock` — runs the renderer against MSW, no real backend needed. Used for UI work that hasn't wired real endpoints yet.
- `pnpm test` — Vitest picks up MSW Node server automatically; request-shape tests against handlers.

**Out of scope (explicitly deferred)**
- New endpoints (OptimLens, SignalReview, TradeAnalysis, strategy versions, engine status, multi-symbol backtest). → `api-contract-new-capabilities`.
- Actual backend changes to conform to the new envelope. → separate `backtest-engine-align-contract` change, after frontend has proved the contract works.
- Real-time / SSE / WebSocket. → Deferred to a dedicated change later.
- Contract tests that hit a real running backtest-engine. → Layer in once backend realigns.
- Auth / authz / rate limiting. → Single-host deployment for now; irrelevant.
