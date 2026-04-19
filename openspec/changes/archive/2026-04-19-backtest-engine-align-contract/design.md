## Context

Today's Go handlers return responses that:
- Use ad-hoc `{"error": "msg"}` error shape (no code)
- Mix ISO strings, Unix seconds, and `time.Time`-formatted output
- Return bare arrays (no pagination wrapper) from `/api/symbols` and `/api/backtest/history`
- Return backtest status as flat fields (`{ task_id, status, progress, s3_progress, ... }`) not the canonical `TaskResponse` envelope

The contract (`api-contract-foundation`) already documents what the canonical shape should be. Frontend's `cremote` bridges the gap via `legacy-adapter.ts`. After this change, backend matches contract; adapter goes away.

## Goals / Non-Goals

**Goals:**
- Every one of the ~12 current endpoints returns exactly the canonical shape in `api/openapi.yaml`.
- Every 4xx/5xx response uses the canonical `{ error: { code, message, details? } }` envelope with a code from the 15-entry dictionary.
- Legacy-adapter deleted; contract-client calls go through directly.
- Contract test suite passes against real running handlers.

**Non-Goals:**
- New endpoints.
- Performance changes.
- Breaking changes to the database schema.
- Auth / rate limiting.

## Decisions

### D1. Typed error registry + helper

**Decision.** `backtest-engine/internal/errors/errors.go` exports:

```go
type Code string
const (
    CodeInvalidInterval Code = "INVALID_INTERVAL"
    CodeSymbolNotFound  Code = "SYMBOL_NOT_FOUND"
    // ... all 15
)

type HTTPError struct {
    Status  int
    Code    Code
    Message string
    Details map[string]any
}
```

Handlers build and return these; a single middleware writes the canonical JSON envelope.

### D2. Response envelope helpers

**Decision.** `internal/handler/respond.go` with:

```go
func RespondOK(c *app.RequestContext, body any)
func RespondTask(c *app.RequestContext, task TaskResponse)
func RespondError(c *app.RequestContext, err *HTTPError)
func RespondPaginated(c *app.RequestContext, items any, nextCursor *string)
```

Rewrites every handler to use these instead of ad-hoc `c.JSON(...)` calls.

### D3. TaskResponse is a Go struct mirroring OpenAPI

**Decision.** Add `internal/model/task.go`:

```go
type TaskResponse struct {
    TaskID     string          `json:"task_id"`
    Status     TaskStatus      `json:"status"`
    Progress   *TaskProgress   `json:"progress,omitempty"`
    Result     json.RawMessage `json:"result,omitempty"`  // narrowed per operation
    Error      *HTTPError      `json:"error,omitempty"`
    StartedAt  int64           `json:"started_at"`
    FinishedAt *int64          `json:"finished_at,omitempty"`
}
```

Handlers wrap operation-specific results into `result` as RawMessage (so the outer marshalling is uniform).

### D4. Cursor encoding: opaque base64 JSON

**Decision.** Cursors for paginated endpoints are `base64(json.Marshal({ key: <id-or-ts>, direction: "next" }))`. Opaque to clients. Server-side parse + validate.

Initial implementation for 2 endpoints: `listSymbols` (cursor by `(rank, symbol)`) and `listBacktestHistory` (cursor by `created_at`).

### D5. Accept ISO dates for one more release with deprecation warning

**Decision.** The existing `parseTime` helper accepts `2025-04-01` strings. Keep for now; add `Warning: deprecated — use Unix seconds` HTTP header when this path is hit. Next major version (or a dedicated change) removes acceptance.

### D6. Contract test approach

**Decision.** `contract_test.go`:

1. Load `api/openapi.yaml` (relative path via Go embed)
2. For each operation in the spec:
   - Spin up handler with a test store (reuse `testdb.New(t)`)
   - Send a request built from the `requestBody.examples` or default params
   - Capture response
   - Validate response body against the operation's schema using `github.com/pb33f/libopenapi` or `getkin/kin-openapi`
3. Fail on any schema violation

Missing example → test auto-skipped with a warning log (lets proposal-only operations slide until their impl change).

### D7. Migrate handlers one at a time, gate with build tag

**Decision.** Land the new `errors/` + `respond` helpers first. Then migrate handlers file-by-file, committing each. Keeps each commit small and reviewable. No feature flag — this is canonical-shape output; frontend's adapter absorbs the transition.

After all handlers migrated, the adapter deletion is its own commit with a clean "remove vestigial code" message.

## Risks / Trade-offs

- **[Subtle response-shape breakage if a handler was wrong-shaped already]** → Contract test catches it. Schema differences surface as test failures; fix before merging.

- **[Existing frontend code (not just `cremote`) parses legacy shapes directly]** → Audit required. Any direct `window.claw.remote.*` call (bypassing `cremote`) may break. Grep for all such uses; migrate to `cremote` first.

- **[Deprecation header is often ignored]** → That's OK for "ISO dates still accepted"; the goal is signaling, not enforcement. A future change hardens.

- **[Schema validation false positives on `additionalProperties`]** → Lean toward `additionalProperties: false` in schemas of canonical shapes; looser schemas for deeply-nested analysis results where exact fields vary.

## Migration Plan

1. Ship `errors/` + `respond.go` helpers. (no handler change yet)
2. Migrate handlers in groups (klines/symbols/gaps → strategies → backtest → screener). One PR per group or one big PR with clean commits.
3. After all handlers migrated + contract tests green, delete `desktop-client/src/services/remote/legacy-adapter.ts`.
4. Verify frontend still works.

Rollback: per-handler revert (each handler's migration is a discrete commit).

## Open Questions

- Should we return the `Warning` header on every deprecated input or only once-per-session? → Every response for simplicity. It's cheap; clients that care parse once.
- Does `RespondPaginated` belong in `handler/` or `errors/` or a new `middleware/` package? → `handler/` for now; factor out if it grows.
- Should the task envelope's `result` be polymorphic on `Content-Type` or just JSON embedded? → Just JSON embedded via `RawMessage`. No content-type polymorphism.
