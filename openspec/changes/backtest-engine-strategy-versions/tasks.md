## 1. Prereqs

- [ ] 1.1 `api-contract-new-capabilities` + `backtest-engine-align-contract` landed.

## 2. Schema migration

- [ ] 2.1 Write `backtest-engine/internal/store/migrations/003_strategy_versions.sql` per design D3 (ADD column, CREATE TABLE, INSERT backfill, DROP columns — all in one transaction).
- [ ] 2.2 Use `{{.Schema}}` template tokens consistently.
- [ ] 2.3 Test locally against a seeded DB to verify backfill works for N existing rows.
- [ ] 2.4 On a fresh schema (empty strategies), migration must still succeed (no NULL violations).

## 3. Store layer

- [ ] 3.1 Add `internal/store/strategy_versions.go`:
  - `ListVersions(ctx, strategyID, limit, cursor) ([]StrategyVersion, nextCursor, error)`
  - `GetVersion(ctx, strategyID, version) (*StrategyVersion, error)`
  - `CreateVersion(ctx, strategyID, payload) (*StrategyVersion, error)` — uses `FOR UPDATE` lock + atomic insert + current_version update
- [ ] 3.2 Modify `internal/store/strategies.go` (or equivalent):
  - `CreateStrategy(ctx, s)` now creates strategies + v1 in one transaction
  - `GetStrategy(ctx, id)` joins with current version for `code` + `params_schema`
  - `ListStrategies(ctx, ...)` joins similarly
- [ ] 3.3 Unit tests against `testdb.New(t)` for each new method.

## 4. Handler layer

- [ ] 4.1 Create `internal/handler/strategy_versions.go`:
  - `GET /api/strategies/:id/versions` → `ListStrategyVersions` handler
  - `POST /api/strategies/:id/versions` → `CreateStrategyVersion` handler
  - `GET /api/strategies/:id/versions/:version` → `GetStrategyVersion` handler
- [ ] 4.2 All use `RespondOK` / `RespondError` / `RespondPaginated` helpers (from align-contract).
- [ ] 4.3 Input validation: path params, body JSON.

## 5. Router registration

- [ ] 5.1 In `internal/router/router.go`, register the 3 new routes.

## 6. Model updates

- [ ] 6.1 Add `StrategyVersion` struct to `internal/model/strategy.go`.
- [ ] 6.2 `Strategy` struct gains `CurrentVersion int`, loses `Code` / `ParamsSchema` (those live on versions now).

## 7. Tests

- [ ] 7.1 `store/strategy_versions_test.go`:
  - CreateVersion happy (linear)
  - CreateVersion explicit fork
  - CreateVersion bad parent_version → error
  - CreateVersion concurrent (spawn 2 goroutines, verify no duplicate versions)
  - ListVersions order + pagination
  - GetVersion happy + not-found
- [ ] 7.2 `handler/strategy_versions_test.go` — contract-driven handler tests.
- [ ] 7.3 `handler/strategy_test.go` — verify CreateStrategy now auto-creates v1.
- [ ] 7.4 Integration: restart server with migrations already run on seeded v1 data; verify list/get/post work.

## 8. Contract sync

- [ ] 8.1 Run `make test-contract` — all new endpoints validate against openapi.yaml.
- [ ] 8.2 If openapi had gaps, patch openapi in this change (cross-change openapi edits acceptable since this change implements the contract).

## 9. Final validation

- [ ] 9.1 All Go tests green.
- [ ] 9.2 Manual: Against a seeded backend, use `curl` to exercise all 3 version endpoints. Verify responses match contract.
- [ ] 9.3 Frontend (Strategy Management after change #8 lands) — version history panel populates from real backend.
