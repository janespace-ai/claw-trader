## Context

Tiny read-only endpoint. Primary design question: where does each field's data come from, and how often can it change?

## Goals / Non-Goals

**Goals:**
- Endpoint returns in < 200ms normally.
- Every field has a clear data source.
- Unavailable data cleanly returns `null`, not an error.

**Non-Goals:**
- Caching layer (endpoint isn't hot enough to need it).
- Real-time updates (UI refreshes on focus).

## Decisions

### D1. Data sources

| Field | Source |
|---|---|
| `version` | Build-injected constant (`-ldflags "-X .../version.Version=$(git describe)"`) |
| `data_aggregator_version` | Try reading `/healthz` JSON from `localhost:<aggregator-port>` if configured, else null |
| `supported_markets` | Hardcoded `["futures"]` (only one right now) |
| `supported_intervals` | `model.SupportedIntervals` |
| `data_range` | `SELECT MIN(ts), MAX(ts) FROM claw.futures_1h` (fastest hypertable for this query) |
| `last_aggregator_sync_at` | `SELECT MAX(synced_at) FROM claw.sync_state WHERE status='done'` |
| `active_tasks` | `BacktestService.RunningCount() + ScreenerService.RunningCount() + AnalysisService.RunningCount()` (last exists after analysis-endpoints change) |
| `uptime_seconds` | `time.Since(processStartTime).Seconds()` (processStartTime captured in main) |

### D2. Data range query: target futures_1h

**Decision.** Query `MIN(ts)` and `MAX(ts)` on `claw.futures_1h`. Interval 1h is a reasonable proxy (most symbols have 1h coverage whenever they have other intervals). Not scanning all 6 interval tables; `data_range` is an approximation.

### D3. Timeout on aggregator version probe

**Decision.** 500ms timeout on the HTTP call to the aggregator. If it fails, `data_aggregator_version = null`. Don't block the response.

### D4. active_tasks is best-effort

**Decision.** In-memory count; doesn't survive restarts. If the service just started and there are zombie DB rows with `status='running'`, they don't count. Acceptable — best-effort approximation.

## Risks / Trade-offs

- **[Aggregator probe latency]** → 500ms cap; null fallback. No worse than the status card being blank.

- **[Data range query is slow on huge tables]** → `MIN(ts)` + `MAX(ts)` use hypertable metadata; millisecond-level. Not a concern.

- **[Version injection not set in dev builds]** → Default to `"dev"` string.

## Migration Plan

Additive; no DB changes. Ship handler + register route.

## Open Questions

- Should `/api/engine/status` include a list of currently-running task_ids? → No — too noisy; if needed, a separate endpoint.
