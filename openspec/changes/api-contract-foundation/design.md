## Context

Today's HTTP surface between `desktop-client` and `backtest-engine` has drifted into three partial sources of truth:

1. **Go handlers** in `backtest-engine/internal/handler/*.go` — declare response shapes via hand-written struct tags, error messages via string literals.
2. **TypeScript client** in `desktop-client/src/services/remote/client.ts` — declares the same shapes independently, with `as any` leaks and ad-hoc polling loops.
3. **Existing OpenSpec specs** (`backtest-api`, `backtest-data-gateway`, `screener-execution`) — describe behaviors but not machine-readable schemas.

The coming UI refactor has to land 8 full-fidelity screens, stand up 5 AI personas, and integrate 3 new backend analysis endpoints. Continuing with three drifting sources will make that work a mess. This change introduces a fourth source of truth that supersedes the others: **`api/openapi.yaml`**, plus a mock layer so the frontend can develop against the contract even when the backend is still catching up.

Constraints that shape the design:
- **Single-host deployment**: no auth, no gateway, no API key management. Cuts a lot of scope.
- **Existing backend runtime is frozen in this change**: all current handler responses stay as-is. The contract documents reality, then follow-up PRs tighten reality to match the canonical form.
- **MSW in Electron renderer** must actually work — preload + contextIsolation + contextBridge interact with fetch interception; a spike is needed.
- **Two consumer contexts** for the mock: Electron renderer (dev mode, pressing the UI manually) and Vitest (unit/integration tests). Node vs browser runtimes for MSW.
- **Not just frontend**: the OpenAPI will guide backend eventually, so schemas must be realistic, not frontend-wishful.

## Goals / Non-Goals

**Goals:**
- One contract file (`api/openapi.yaml`) that describes every currently-live backend endpoint with full request/response schemas.
- A predefined error-code dictionary (`api/errors.md`) that the frontend and eventually the backend both reference.
- A canonical task envelope for long-running operations, applied at least in the openapi schema for backtest + screener (actual backend alignment comes later).
- Auto-generated TypeScript types (`src/types/api.d.ts`) committed to the repo, refreshed by a single `pnpm api:types` command.
- MSW mock layer that makes `fetch('/api/...')` return the example fixtures in `api/examples/` inside dev and tests.
- `pnpm dev:mock` + `pnpm test` work end-to-end without any running backend.
- Existing tests continue to pass.

**Non-Goals:**
- Changing any backend handler in this change.
- Adding any new endpoint (OptimLens, SignalReview, etc. — next change).
- Migrating the UI screens to actually use the contract client. One or two call-sites get migrated as a smoke test; broad migration is UI refactor work.
- Generating backend Go types from the OpenAPI. Possible future enhancement; not today.
- SSE / WebSocket. Polling stays as-is.
- Contract tests against a real backend. Deferred.

## Decisions

### D1. OpenAPI 3.1, YAML, single file

**Decision.** `api/openapi.yaml` is the single source of truth. OpenAPI 3.1 (latest stable, JSON Schema alignment) over 3.0 (weaker schema expressiveness). YAML over JSON because humans will read and edit it in PR reviews.

**Alternatives considered.**
- **Hand-rolled Markdown tables** — no tooling, invites drift.
- **TypeSpec / Smithy** — nicer DX but adds a compile step and non-standard format for reviewers; not worth the added learning curve for a 2-person team.
- **Protobuf + gRPC** — overkill for HTTP/JSON; major client migration.
- **JSON Schema without OpenAPI wrapper** — covers shapes but not operations, routing, examples. OpenAPI gives both.

**Consequence.** One file grows over time; we'll split into `$ref`'d component files if it crosses ~3000 lines. Currently expected ~800 lines at the end of this change.

### D2. Auto-generate TS types, commit the generated file

**Decision.** `openapi-typescript` runs via `pnpm api:types` and writes `desktop-client/src/types/api.d.ts`. The file is committed. CI (for now: pre-commit hook + `make test-ci` target) runs the generator and fails if the output differs — forcing whoever edited `openapi.yaml` to also regen.

**Alternatives considered.**
- **Don't commit, generate at build time** — CI/dev divergence; reviewers can't see the type surface in PR diff.
- **orval / swagger-typescript-api** — fancier output (React Query hooks, etc.) but heavier dep tree and more opinionated. Plain `openapi-typescript` keeps types vanilla.

**Consequence.** Tiny diffs on openapi.yaml now produce visible type diffs in the same PR. Cognitive cost of seeing the generated file is worth the drift protection.

### D3. MSW for mocks, not a standalone server

**Decision.** MSW (Mock Service Worker) runs in the renderer in dev (via `setupWorker`) and in Vitest (via `setupServer` for Node). Handlers are generated once from `api/openapi.yaml` + `api/examples/*.json` by a small script at `desktop-client/scripts/gen-msw-handlers.ts`.

```
            api/openapi.yaml  ──┐
            api/examples/*.json ┼──▶ gen-msw-handlers.ts ──▶ src/mocks/handlers.ts
                                │                                   │
                                │                                   ├─▶ browser.ts (renderer dev)
                                │                                   └─▶ node.ts    (Vitest)
```

**Alternatives considered.**
- **Prism (from openapi-generator)** — separate process, needs port coordination, adds `docker-compose.mock.yml` or npm script complexity.
- **json-server** — doesn't honor openapi; handlers would still be hand-written.
- **Hand-written handlers without generator** — keeps drift between `examples/` and what MSW returns.

**Consequence.** Adding a new operation to openapi.yaml + one file in `examples/` = MSW picks it up on next `gen`. No per-operation handler coding.

**Risk.** MSW renderer setup inside Electron with `sandbox: false` + `contextIsolation: true` has subtle edge cases (service worker registration path, `import.meta.env` visibility). The tasks document includes a pre-flight spike.

### D4. Task envelope is defined in the schema, enforced by mock, adoption by backend deferred

**Decision.** `openapi.yaml` defines a reusable `TaskResponse<T>` component:

```yaml
components:
  schemas:
    TaskStatus:
      type: string
      enum: [pending, running, done, failed, cancelled]
    TaskResponse:
      type: object
      required: [task_id, status, started_at]
      properties:
        task_id: { type: string, format: uuid }
        status: { $ref: "#/components/schemas/TaskStatus" }
        progress:
          type: object
          properties:
            phase: { type: string }
            done: { type: integer }
            total: { type: integer }
        result: { } # generic; concrete per operation
        error: { $ref: "#/components/schemas/ErrorBody" }
        started_at: { type: integer, description: "unix seconds" }
        finished_at: { type: integer, nullable: true }
```

Each operation that uses it (`/api/backtest/status`, `/api/screener/result`) references it and narrows `result` via `allOf`. MSW handlers emit this exact shape. Backend currently returns a slightly different shape (flatter; `result` is fields on the root object); the spec documents the **canonical** shape, and a follow-up PR aligns the backend.

**Alternatives considered.**
- **Per-endpoint custom shape** — what we have today; the whole problem.
- **Align backend first, then write spec** — blocks contract work on backend PR; contract-first approach inverts this deliberately.

**Consequence.** Until backend aligns, the frontend's contract client will have to either (a) use a thin adapter that normalizes the legacy shape into the canonical one, or (b) fail validation loudly and skip migration of those endpoints until backend catches up. Plan: adapter; marked `@deprecated` with a target date comment.

### D5. Error envelope + code dictionary

**Decision.** All 4xx/5xx responses follow:

```yaml
ErrorBody:
  type: object
  required: [code, message]
  properties:
    code: { $ref: "#/components/schemas/ErrorCode" }
    message: { type: string }
    details:
      type: object
      additionalProperties: true
ErrorResponse:
  type: object
  required: [error]
  properties:
    error: { $ref: "#/components/schemas/ErrorBody" }
ErrorCode:
  type: string
  enum:
    - INVALID_INTERVAL
    - INVALID_SYMBOL
    - INVALID_RANGE
    - SYMBOL_NOT_FOUND
    - STRATEGY_NOT_FOUND
    - BACKTEST_NOT_FOUND
    - SCREENER_NOT_FOUND
    - TASK_NOT_FOUND
    - COMPLIANCE_FAILED
    - SANDBOX_ERROR
    - SANDBOX_TIMEOUT
    - DATA_UNAVAILABLE
    - RATE_LIMITED
    - UPSTREAM_UNREACHABLE
    - INTERNAL_ERROR
```

15 codes. `api/errors.md` narrates each one: when it fires, what `details` carries, how the UI should present it. Frontend i18n strings are keyed by code.

**Alternatives considered.**
- **Free-form strings** — current state; unparseable for branching.
- **HTTP status code only** — not granular enough (e.g. two 400 errors with different UX).
- **Numeric codes** — unreadable in logs.

**Consequence.** Backend currently doesn't emit these codes. Same deferred-alignment strategy as D4: an adapter layer in the contract client normalizes string errors to `INTERNAL_ERROR` with the raw message in `details.legacy_message` until backend catches up.

### D6. Timestamps: Unix seconds everywhere over the wire

**Decision.** Every `ts`, `started_at`, `finished_at`, `from`, `to` field on the wire is an **integer** representing Unix seconds. No milliseconds (saves 3 zeros on serialization, avoids JS `Date` pitfalls, Timescale's `ts` is already in seconds). No ISO 8601.

Dates in URL query strings are still Unix seconds: `?from=1700000000&to=1732000000`. The current backend happily parses `from=2025-04-01` too — the spec deprecates that form but doesn't remove it until a later change.

**Alternatives considered.**
- **ISO 8601** — human-friendlier in URLs, but JS Date parsing is notoriously loose (e.g. `new Date("2025-04-01")` is midnight UTC vs local depending on version). Unix seconds are machine-first, which is what APIs should be.
- **Unix milliseconds** — JavaScript native, but Timescale/Postgres store seconds; conversion costs everywhere.

### D7. Pagination: cursor-based, never offset

**Decision.** List endpoints use `?cursor=<opaque>&limit=<n>` (max 500). Response body includes `next_cursor: string | null`. Opaque cursors are base64-encoded JSON internally (e.g. `{"id": "...", "ts": ...}`), but the UI treats them as strings.

Only `/api/symbols` list and future `/api/strategies` list need this at first; others (klines, gaps) are inherently time-bounded.

**Alternatives considered.**
- **Offset/limit** — races against mutations, poor for growing tables.
- **Cursor from `ROW_NUMBER()`** — not stable across concurrent inserts.

### D8. Versioning: no URL prefix, use a header when we need to break

**Decision.** Keep `/api/klines` etc. without a `/v1/` prefix. If we need to break, introduce `X-Claw-API-Version: 2`. Zero ceremony today; escape hatch exists.

Rationale: desktop-client ships versioned with the backend. We control both sides; pre-auth versioning is premature.

### D9. MSW handlers generated, not hand-written

**Decision.** `desktop-client/scripts/gen-msw-handlers.ts` reads `api/openapi.yaml`, walks every operation, and emits one `http.get(...)` / `http.post(...)` per operation that returns `api/examples/<operation_id>.json`. Generated file `src/mocks/handlers.ts` is committed; CI regen + diff check prevents drift.

Handlers have **three modes**, decided by a `CLAW_MOCK_PROFILE` env var:

| Mode | Behavior |
|---|---|
| `happy` (default) | Every request returns the committed example with 200 |
| `slow` | Same responses, 500–1500ms delay — UI loading states get exercised |
| `chaos` | 15% of requests return random `ErrorCode` 4xx/5xx — error paths exercised |

**Consequence.** Three modes is enough; fancier behavior (e.g. stateful backtest progress) will be hand-patched in a companion `handlers.overrides.ts` for specific scenarios.

### D10. Adoption rollout: contract client wraps, doesn't replace

**Decision.** `src/services/remote/contract-client.ts` exposes a single `cremote` object with fully-typed methods (`cremote.getKlines(params)`). It internally calls the existing `remote.*` (thus still goes through IPC → main process fetch), but:

- Request params are typed from openapi.
- Response is validated against the openapi schema at runtime (dev only; prod skips); mismatches log a console warning, not a throw.
- Returns typed results.

The existing `src/services/remote/client.ts` stays functional during the migration. New UI code should use `cremote`; old UI code migrates opportunistically.

**Consequence.** No big-bang rewrite. Migration pressure comes from: new UI screens must use `cremote`, typechecking warns on `any` leaks, eventually we delete `client.ts`.

## Risks / Trade-offs

- **[MSW in Electron renderer might not just work]** → Mitigation: first task of the apply phase is a spike — write a tiny "hello msw" handler, load the renderer, verify intercept. If the service worker route confuses `vite-plugin-electron`, fallback is `msw/node` only (no browser mode; renderer talks to a localhost mock server instead). Design decision recorded in-place.

- **[Backend drift from contract during the interim]** → Mitigation: the contract-client has a runtime validator that logs warnings on shape mismatches. Those warnings feed the list of things the backend-alignment PR fixes. Not a silent drift.

- **[Generated type file is big + churns a lot in PRs]** → Accepted. The diff is the signal.

- **[Task envelope change breaks existing polling code]** → Not in this change. The existing `remote.backtestStatus` / `remote.screenerResult` keep returning today's shape. Only the contract client sees the canonical shape via adapter.

- **[The 15 error codes might be wrong]** → They're a starting point. Adding a code is cheap (edit enum + doc). Removing is costly. We'll err on the side of adding conservatively.

- **[Example files grow stale / lie]** → Mitigation: `pnpm api:lint` validates every example against its operation's schema. Any drift fails CI.

- **[No real CI running `api:lint` yet]** → Same as `make test-ci` situation: local Makefile target is the source of truth; GHA wrapper is a future change.

## Migration Plan

This change is additive at the code level:
1. Land `api/openapi.yaml` + `api/examples/` + `api/errors.md` + `api/README.md`.
2. Land `openapi-typescript`, `msw` devDeps + generator scripts.
3. Land generated `src/types/api.d.ts`, `src/mocks/*`, `src/services/remote/contract-client.ts`.
4. Migrate **one** existing call-site (e.g. `ScreenerPage`'s `remote.startScreener` call) to use `cremote`, as a proof-of-life. All others stay on legacy paths.
5. Wire `pnpm dev:mock` + Vitest MSW; verify all 36 existing tests still pass.

Rollback is a commit revert — no data changes, no runtime breakage.

## Open Questions

- Should `api/openapi.yaml` live under `api/` (repo root) or inside a service? → Root, because both services and the client read it; putting it inside `backtest-engine/` would imply ownership, which is misleading before backend aligns.
- Do we want `Authorization` header documented as `X-Claw-Token` for future-proofing, or leave auth entirely absent? → Leave absent. Adding it later is a non-breaking addition.
- Should `/api/backtest/result` and `/api/screener/result` merge into one shape? → They're in different capabilities and follow the task envelope; keep separate, share the envelope.
- Do we have a reliable mapping from existing Go handler errors to the new 15 codes? → Not yet; the backend-alignment PR (not this one) owns that mapping. Interim: everything maps to `INTERNAL_ERROR`.
