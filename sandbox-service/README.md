# claw-sandbox-service

Long-lived Python sandbox with a prefork worker pool.  Replaces the previous
"one Docker container per backtest" model; `service-api` now pushes jobs
to this service over HTTP rather than shelling out to the Docker daemon.

## Why a separate service?

- Removes `/var/run/docker.sock` from `service-api` (no more equivalent-
  root exposure, no more Docker daemon permission errors).
- Avoids ~800 ms–2 s cold-start per job — workers pre-import
  numpy / pandas / ta-lib / `claw` framework once at boot.
- Resource limits are applied per-job via Linux `rlimit` inside each worker,
  not by spinning up a container.

See `openspec/changes/sandbox-service-and-ai-review/design.md` for the full
rationale.

## Layout

```
sandbox-service/
├── Dockerfile               # ta-lib built from source + pip install
├── config.yaml              # pool size, job limits, DB url, callback allowlist
├── pyproject.toml           # deps + tooling
├── src/
│   ├── api/                 # FastAPI app (POST /run, GET /status, /healthz)
│   ├── pool/                # Master + worker lifecycle, rlimit, recycle
│   ├── worker/              # Job runner (loads user code, runs strategy/screener)
│   ├── callback/            # HTTP client to service-api's /internal/cb/*
│   └── claw/                # Migrated framework code (Strategy / Screener / DBReader / …)
└── tests/                   # pytest
```

## Running locally (without Docker)

```bash
cd sandbox-service
pip install -e '.[dev]'
export CLAW_READONLY_DB_URL=postgresql://claw_readonly:pw@localhost:5432/claw
python -m api.main
```

## Running via Docker Compose

Wired in the root `docker-compose.yml`:

```bash
docker compose up sandbox-service
```

`sandbox-service` joins the internal `claw-sandbox-net` network along with
`service-api` and `timescaledb`.  It does **not** publish a port to the
host — only `service-api` can reach it.

## Configuration

All settings live in `config.yaml`.  Env vars override with prefix
`SANDBOX_` and `__` as the section separator:

```bash
SANDBOX_POOL__POOL_SIZE=8 python -m api.main
```

Key options:

| Key                          | Default  | Notes |
|------------------------------|----------|-------|
| `pool.pool_size`             | 4        | concurrent jobs |
| `pool.recycle_after_jobs`    | 50       | worker retires after N jobs |
| `pool.shutdown_grace_seconds`| 60       | SIGTERM drain window |
| `job_limits.memory_mb`       | 2048     | `RLIMIT_AS` |
| `job_limits.cpu_seconds`     | 1800     | `RLIMIT_CPU` (30 min) |
| `job_limits.max_file_size_bytes` | 0    | `RLIMIT_FSIZE` = 0 ⇒ no writes |
| `db.url`                     | env var  | **must** be `claw_readonly` |
| `callback.allowlist_hosts`   | list     | dial-allow list for callback URLs |

## Testing

```bash
pip install -e '.[dev]'
pytest
ruff check src tests
mypy
```

## Ops

- `/healthz` returns 200 only when all workers are warm and ready.
- SIGTERM triggers graceful shutdown (stop accepting new jobs, drain workers,
  fail any in-flight with `SANDBOX_SHUTDOWN`).
- Logs are JSON — pipe to your log aggregator of choice.
