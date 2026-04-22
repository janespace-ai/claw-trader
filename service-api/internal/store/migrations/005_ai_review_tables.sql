-- Migration 005: AI code-review cache + audit trail (Gate 2).
--
-- Two tables:
--
--   ai_review_cache — memoize verdicts keyed by a hash of the normalized
--     user code.  Gate 2 reads here before calling DeepSeek; on miss it
--     calls the model and writes a fresh row.  TTL'd via `expires_at`.
--
--   ai_review_audit — every Gate 2 decision (cache hit or miss) is
--     recorded here so we have a forensic trail when a user disputes a
--     reject.  Append-only; never read by Gate 2's hot path.
--
-- Note on normalization: `code_hash` is sha256 over the code after
-- comments are stripped and whitespace is collapsed — so cosmetic
-- tweaks don't cause cache misses.  See aireview/normalize.go.

CREATE TABLE IF NOT EXISTS {{.Schema}}.ai_review_cache (
    code_hash       TEXT            PRIMARY KEY,  -- sha256 hex of normalized code
    verdict         TEXT            NOT NULL,     -- 'approve' | 'reject'
    reason          TEXT            NOT NULL DEFAULT '',
    model           TEXT            NOT NULL,     -- e.g. 'deepseek-reasoner'
    dimensions      JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ     NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_review_cache_expires_idx
    ON {{.Schema}}.ai_review_cache (expires_at);

-- Audit trail — one row per Review() invocation (hit or miss).
CREATE TABLE IF NOT EXISTS {{.Schema}}.ai_review_audit (
    id              BIGSERIAL       PRIMARY KEY,
    task_id         TEXT,                         -- nullable: preview calls don't have one
    code_hash       TEXT            NOT NULL,
    model           TEXT            NOT NULL,
    verdict         TEXT            NOT NULL,     -- 'approve' | 'reject'
    reason          TEXT            NOT NULL DEFAULT '',
    dimensions      JSONB           NOT NULL DEFAULT '{}'::jsonb,
    cache_hit       BOOLEAN         NOT NULL,
    latency_ms      INTEGER         NOT NULL,     -- 0 on cache hit
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_review_audit_task_idx
    ON {{.Schema}}.ai_review_audit (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_review_audit_created_idx
    ON {{.Schema}}.ai_review_audit (created_at DESC);

-- claw_readonly must NOT see these tables — sandbox workers have no
-- legitimate reason to read cache/audit.  Explicit REVOKE stays
-- idempotent across re-runs.
REVOKE ALL ON {{.Schema}}.ai_review_cache  FROM claw_readonly;
REVOKE ALL ON {{.Schema}}.ai_review_audit  FROM claw_readonly;
