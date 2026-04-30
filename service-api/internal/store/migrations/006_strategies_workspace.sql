-- Migration 006: unified-strategy-workspace fields on strategies.
--
-- Adds:
--   draft_code         — latest in-flight code from chat workspace
--   draft_symbols      — latest in-flight symbol list from chat
--   saved_code         — last committed code snapshot (write only via /save)
--   saved_symbols      — last committed symbols snapshot
--   saved_at           — timestamp of last save (null until first save)
--   last_backtest      — JSON cache: { task_id, summary, ran_at }
--   is_archived_draft  — true when user pressed "+ 新建策略" without saving
--
-- Backfill: each existing row's saved_code/saved_symbols/saved_at default
-- to the row's current_version code (joined from strategy_versions) and
-- updated_at.  Treats every pre-existing strategy as already "saved" so
-- the new UI doesn't show legacy strategies as drafts.
--
-- The legacy `code_type` column stays for backwards-compat with archived
-- screener rows (no longer set on new rows) — see strategy-api spec.
--
-- Idempotent on re-run: IF NOT EXISTS / DO blocks guard backfill.

BEGIN;

ALTER TABLE {{.Schema}}.strategies
    ADD COLUMN IF NOT EXISTS draft_code        TEXT,
    ADD COLUMN IF NOT EXISTS draft_symbols     JSONB,
    ADD COLUMN IF NOT EXISTS saved_code        TEXT,
    ADD COLUMN IF NOT EXISTS saved_symbols     JSONB,
    ADD COLUMN IF NOT EXISTS saved_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_backtest     JSONB,
    ADD COLUMN IF NOT EXISTS is_archived_draft BOOLEAN NOT NULL DEFAULT false;

-- Backfill saved_code / saved_symbols / saved_at for existing rows.
-- Pulls code from the strategy_versions row matching current_version.
-- Skips rows already filled (re-running this migration is a no-op).
DO $usw_backfill$
BEGIN
    UPDATE {{.Schema}}.strategies s
    SET
        saved_code    = sv.code,
        saved_symbols = '[]'::jsonb,
        saved_at      = s.updated_at,
        draft_code    = sv.code,
        draft_symbols = '[]'::jsonb
    FROM {{.Schema}}.strategy_versions sv
    WHERE sv.strategy_id = s.id
      AND sv.version     = s.current_version
      AND s.saved_at     IS NULL;
END
$usw_backfill$;

-- Index for "library page" queries: order by saved_at desc, filter on
-- is_archived_draft.  is_archived_draft is on the same partial index so
-- the conversation-list query is one b-tree lookup.
CREATE INDEX IF NOT EXISTS strategies_saved_at_idx
    ON {{.Schema}}.strategies (saved_at DESC NULLS LAST)
    WHERE is_archived_draft = false;

CREATE INDEX IF NOT EXISTS strategies_archived_idx
    ON {{.Schema}}.strategies (is_archived_draft)
    WHERE is_archived_draft = true;

COMMIT;
