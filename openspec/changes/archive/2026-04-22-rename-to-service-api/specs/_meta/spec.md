# Pure-Infrastructure Change — No Spec Deltas

This change renames a directory and an env-var prefix.  It does NOT
alter, add, or remove any capability's spec-level requirements.

The spec-driven workflow requires a specs artifact to exist before
tasks can be written; this file satisfies that artifact with an
explicit non-op declaration.

## Why no deltas

| Layer | Changed? |
|---|---|
| HTTP endpoints (paths, methods) | No |
| HTTP payload shapes (request / response) | No |
| Error codes / status mappings | No |
| Database schema | No |
| Callback protocol | No |
| Gate 1 / Gate 2 semantics | No |
| Worker pool / rlimits behaviour | No |

Only renamed:

- Directory `backtest-engine/` → `service-api/`
- Env-var prefix `BACKTEST_*` → `SERVICE_API_*`
- Docker image / container name
- A handful of string literals (callback URL, allowlist host entry)
- A few stray files moved into better homes (`design/`, `e2e/`)

## Archive

At archive time, invoke `openspec archive rename-to-service-api --skip-specs`
so no empty delta sync is attempted against the main specs.
