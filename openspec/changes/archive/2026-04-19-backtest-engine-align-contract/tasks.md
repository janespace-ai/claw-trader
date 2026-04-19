## 1. Foundation: errors + respond helpers

- [x] 1.1 Create `backtest-engine/internal/errors/errors.go` with 15 `Code` constants + `HTTPError{Status, Code, Message, Details}` struct + `New(code, msg)` / `Wrap(err, code)` builders.
- [x] 1.2 Create `backtest-engine/internal/handler/respond.go` with `RespondOK`, `RespondTask`, `RespondError`, `RespondPaginated` helpers.
- [x] 1.3 Unit tests for builders + helpers.

## 2. Model updates

- [x] 2.1 Add `internal/model/task.go` with `TaskResponse`, `TaskStatus`, `TaskProgress` structs (matching openapi).
- [x] 2.2 Add `internal/model/pagination.go` with `Paginated[T]` (or `PaginatedItems` generic wrapper) + cursor encode/decode helpers (`base64(json.Marshal(cursorPayload))`).
- [x] 2.3 Audit existing types with ISO-string `created_at` / `updated_at`; change to `int64` (Unix seconds).

## 3. Migrate /api/klines, /api/symbols, /api/gaps

- [x] 3.1 `handler/kline.go` — error paths → `RespondError` with codes. Time params accept both Unix s and `YYYY-MM-DD` (warning). Response ts as int64.
- [x] 3.2 `handler/symbol.go` — switch response to `Paginated[Symbol]`. Implement cursor encode/decode on `(rank, symbol)`.
- [x] 3.3 `handler/gap.go` — errors aligned. Response stays bare array (small).
- [x] 3.4 Delete the legacy adapter functions in `desktop-client/src/services/remote/legacy-adapter.ts` for these three ops.

## 4. Migrate /api/strategies CRUD

- [x] 4.1 `handler/strategy.go` — `createStrategy` / `listStrategies` / `getStrategy` errors aligned; list uses `Paginated[Strategy]`.
- [x] 4.2 Remove adapter entries.

## 5. Migrate /api/backtest/*

- [x] 5.1 `handler/backtest.go::Start` — returns canonical `TaskResponse`.
- [x] 5.2 `handler/backtest.go::Status` — wraps progress + result into canonical.
- [x] 5.3 `handler/backtest.go::Result` — same; on failure embeds `error` inside `TaskResponse`.
- [x] 5.4 `handler/backtest.go::History` — `Paginated[BacktestHistoryItem]` with cursor on `created_at`.
- [x] 5.5 Remove adapter entries.

## 6. Migrate /api/screener/*

- [x] 6.1 `handler/screener.go::Start` — canonical `TaskResponse`.
- [x] 6.2 `handler/screener.go::Result` — canonical.
- [x] 6.3 Remove adapter entries.

## 7. Contract test suite

- [x] 7.1 `handler/contract_test.go`: loads `api/openapi.yaml` (via `go:embed ../../api/openapi.yaml` or a relative path resolver), iterates operations, issues requests, validates responses against schema.
- [x] 7.2 Use `github.com/getkin/kin-openapi` (or equivalent) for schema validation.
- [x] 7.3 Seed test DB via `testdb.New(t)`, insert minimal fixtures for each resource the ops need.
- [x] 7.4 Makefile target `test-contract` → `cd backtest-engine && go test ./internal/handler/ -run Contract`.
- [x] 7.5 Include in `test-ci`.

## 8. Delete legacy-adapter

- [x] 8.1 After all migrations green, delete `desktop-client/src/services/remote/legacy-adapter.ts`.
- [x] 8.2 Delete import sites in `contract-client.ts`.
- [x] 8.3 Run `pnpm test` + `pnpm test:visual` — all green (means adapter was truly vestigial).

## 9. Documentation

- [x] 9.1 Update `api/README.md` — "Backend alignment complete" section.
- [x] 9.2 Update `TESTING.md` — add `make test-contract` blurb.

## 10. Final validation

- [x] 10.1 `make test-contract` → 0 failures.
- [x] 10.2 `make test` (Go + vitest) all green.
- [x] 10.3 `make test:visual` green (UI should be unchanged).
- [x] 10.4 Manual: run `pnpm dev` against real backend, exercise Screener + Backtest flows, verify no console errors related to shape mismatches.
