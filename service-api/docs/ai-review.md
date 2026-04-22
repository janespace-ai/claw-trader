# Gate 2 — AI Code Review

This document is the operator's reference for the AI code-review layer
(`internal/aireview/`).  For the user-facing experience see the desktop app's
in-UI help.

## Why two gates

Gate 1 (`internal/compliance/`) runs a Python AST analyzer against the user's
strategy code and rejects on forbidden imports / builtins / modules.  It's fast
(single-digit ms) and catches the obvious stuff — `import os`, `exec(...)`,
`open('/etc/passwd')` — but it's a pattern matcher, not a semantic reviewer.
It can't tell a well-disguised prompt-injection payload from a legitimate
strategy.

Gate 2 is the semantic reviewer.  It sends the user code to DeepSeek's
`deepseek-reasoner` with a system prompt that enforces:

1.  **Security review** — arbitrary-code-exec tricks, network/filesystem escape,
    prompt-injection payloads, DoS patterns.
2.  **Correctness review** — does the code actually implement a Strategy or
    Screener contract, or is it obviously broken?
3.  **Binary verdict** — `approve` iff BOTH dimensions pass.

Gate 1 still runs first because it's free and catches the simple cases before
we pay DeepSeek tokens.

## Pipeline order

```
POST /api/backtest/start
  └─ compliance.Check()       ← Gate 1 (AST)
     └─ aireview.Review()     ← Gate 2 (LLM, this doc)
        └─ store.CreateBacktestRun()   ← only if both gates pass
           └─ sandboxclient.Run()       ← dispatch to sandbox-service
```

Key invariant: **Gate 2 rejects short-circuit BEFORE `CreateBacktestRun`**.
Rejected code never pollutes the `claw.backtest_runs` / `claw.screener_runs`
tables.  The audit trail lives in `claw.ai_review_audit` instead.

## Fail-closed behaviour

Any failure that prevents us from getting a clear `approve` becomes a
rejection:

| Situation | Outcome | HTTP |
|---|---|---|
| Model returns `approve` with both dimensions `pass` | approved | (proceed) |
| Model returns `reject` | `AIRejectedError` | 403 `AI_REJECTED` |
| Model returns `approve` but a dimension is `fail` | treated as reject (contradiction) | 403 `AI_REJECTED` |
| Model returns unparseable JSON / wrapped in fences that can't be stripped | reject | 403 `AI_REJECTED` |
| HTTP error from DeepSeek (5xx, 429, …) | reject | 403 `AI_REJECTED` |
| Network timeout (30 s default) | reject | 403 `AI_REJECTED` |
| API key missing, service disabled | `ErrUnavailable` | 503 `AI_REVIEW_UNAVAILABLE` |

`AI_REJECTED` (403) and `AI_REVIEW_UNAVAILABLE` (503) are deliberately distinct:
rejection is about the **code**, unavailability is about the **reviewer**.
Users see different UI hints (`errors.friendly.ai_rejected.*` vs
`ai_unavailable.*`).

## Caching

Every `Review()` call is keyed by a sha256 of the **normalized** user code.
"Normalized" (see `normalize.go`) means:

- Python comments stripped (`# ...`, string-literal-safe)
- Blank lines dropped
- Per-line trailing whitespace trimmed
- CRLF → LF

So cosmetic edits — added a docstring, re-indented — hit the cache.  Semantic
edits (renaming an identifier, changing a constant) miss and get a fresh
review.  Cache entries live in `claw.ai_review_cache`; default TTL is 30
days (configurable via `ai_review.cache_ttl_days`).

## Model-drift protection

At boot (`aireview.Service.Start`) we DELETE all cache rows whose
`model != ai_review.model`.  This prevents an operator who flips the
model in config.yaml from accidentally serving cached verdicts from the
previous model — which might have had different safety priors.

If you bump the `model` config value, the first hit after restart for each
previously-cached code will miss and call DeepSeek fresh.  That's intentional.

## Prompt versioning

The active system prompt lives in `prompt.go`.  When you materially change
it (new review rule, reworded instruction), bump `ai_review.prompt_version`
— this prefixes the cache key so existing verdicts for the old prompt are
naturally invalidated.  Don't retroactively alter `promptV1`; add `promptV2`
and switch the config.

## Reading the audit table

Every `Review()` invocation writes one row to `claw.ai_review_audit`:

```sql
SELECT
  created_at, task_id, verdict, cache_hit, latency_ms, model,
  reason, dimensions
FROM claw.ai_review_audit
ORDER BY created_at DESC
LIMIT 20;
```

Useful queries:

- **Find all rejects for a user's submission**:
  ```sql
  SELECT verdict, reason, dimensions, created_at
  FROM claw.ai_review_audit
  WHERE task_id = '<runID>'
  ORDER BY created_at;
  ```

- **Cost sanity check** — cache hit ratio and token-shaped latency:
  ```sql
  SELECT
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) FILTER (WHERE cache_hit) AS hits,
    COUNT(*) FILTER (WHERE NOT cache_hit) AS misses,
    ROUND(AVG(latency_ms) FILTER (WHERE NOT cache_hit)) AS avg_live_ms
  FROM claw.ai_review_audit
  WHERE created_at > now() - interval '1 day'
  GROUP BY 1
  ORDER BY 1 DESC;
  ```

- **Find the verdicts for a specific piece of code** — same user code
  submitted N times, regardless of who submitted it:
  ```sql
  SELECT created_at, task_id, verdict, cache_hit
  FROM claw.ai_review_audit
  WHERE code_hash = '<hex>'
  ORDER BY created_at;
  ```

The audit table is append-only and never read by the hot path; safe to
retain indefinitely (or age out with a nightly `DELETE WHERE created_at <
now() - interval '90 days'`).

## Clearing the cache (emergency)

If a model update changed semantics and you want to re-review everything
without also bumping the config `model` field (which triggers the drift purge),
run:

```bash
# Inside the timescaledb container:
psql -U claw -d claw -c "TRUNCATE claw.ai_review_cache;"
```

Subsequent submits will re-query DeepSeek.  The audit table is NOT touched.

A more discriminating purge — e.g. only rows older than N days:

```sql
DELETE FROM claw.ai_review_cache WHERE created_at < now() - interval '7 days';
```

## Disabling Gate 2 temporarily

Set `SERVICE_API_AI_REVIEW_ENABLED=false` and restart service-api.  Submits
will bypass Gate 2 entirely (Gate 1 still runs).  The service retains this
flag read-only; there is no runtime toggle.

## Code reference

| File | What it does |
|---|---|
| `internal/aireview/service.go` | `Review()` entry point, fail-closed orchestration |
| `internal/aireview/deepseek_client.go` | DeepSeek HTTP wire — one method, `Chat()` |
| `internal/aireview/prompt.go` | Versioned system prompt |
| `internal/aireview/normalize.go` | Code hash / normalization for cache key |
| `internal/aireview/cache.go` | `claw.ai_review_cache` Get / Put / PurgeModelDrift |
| `internal/aireview/audit.go` | `claw.ai_review_audit` append |
| `internal/store/migrations/005_ai_review_tables.sql` | Schema |
