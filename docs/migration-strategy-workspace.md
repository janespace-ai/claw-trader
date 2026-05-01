# Migration: unified-strategy-workspace

This change reshapes the desktop client around a single chat-driven
"strategy session" instead of three disjoint tabs (选币 / 策略 / 回测).
It is shipping as a v1 rebuild — there is no compat shim for v0 data
because v0 has not been released externally.

If you are running an early build (claw-trader pre-v1), this is what
you need to know before pulling.

## What changed

### Tabs

Before:

```
[选币] [策略] [回测]
```

After:

```
[创建/编辑策略] [策略库]
```

`选币` is gone — the screener Python program now runs internally,
dispatched by the AI strategist when you say things like "筛 24h
成交额 top 30".  The workflow is `chat → AI emits filter → backend
runs it → symbols land in your current strategy's draft_symbols`.

`策略` is gone as a top-level tab, replaced by `策略库` which lists
every strategy (saved or draft) as a chat-history-style card.

`回测` is gone as a top-level tab.  Backtests are dispatched
**automatically** when both halves of a workspace (code + symbols)
become present for the first time.  Subsequent backtests are
explicit (the action bar shows a 重新跑回测 button).  The legacy
deep-backtest screen is preserved as a "查看完整报告" drill-down
opened from the result tab.

### Strategy data shape

A "Strategy" used to be `{ id, name, code, code_type, params_schema,
... }`.  After migration 006 it gains:

```
draft_code         — latest from chat workspace, mutates freely
draft_symbols      — latest in-flight symbol list
last_backtest      — cached summary of most recent backtest run
saved_code         — committed snapshot, only updated via /save
saved_symbols      — committed snapshot
saved_at           — timestamp of last 保存策略 click
is_archived_draft  — flips true when user pressed "+ 创建新策略" while dirty
```

### New endpoints (additive)

```
PATCH  /api/strategies/{id}                — update draft_* fields only
POST   /api/strategies/{id}/save           — snapshot draft → saved
POST   /api/strategies/{id}/archive_draft  — set is_archived_draft=true
```

The existing `POST /api/strategies` and `GET /api/strategies/{id}` keep
their semantics; their JSON body just grows the new fields.

### Removed endpoints

None.  `POST /api/screener/start` and `GET /api/screener/result/:id`
remain on the backend (the AI strategist uses them), but they are no
longer exposed as user-visible operations.

## Data migration

### Server (PostgreSQL)

`service-api` runs all migrations on every boot.  Migration 006:

- `ALTER TABLE strategies ADD COLUMN ... ` for the 7 new columns.
- One-shot `UPDATE` that backfills `saved_code`, `saved_symbols`,
  `saved_at` from existing `strategy_versions[current_version].code`
  + `updated_at` so old rows show up as "saved" in the new library
  (instead of "draft").
- New B-tree index on `(saved_at desc nulls last)` for the library
  page query.

This migration is idempotent — re-runs leave the data untouched.

### Client (Electron SQLite)

The client SQLite gains a `strategy_chats` table (per-strategy chat
history, append-only).  On first launch after upgrade:

- Existing `conversations` rows that have a `strategy_id` are migrated
  into `strategy_chats` row-by-row, preserving message order and ts.
- Orphan conversations (no associated strategy) stay in the legacy
  `conversations` table for one release cycle and can be browsed via
  a "Legacy" filter (planned, low-priority — file an issue if you
  miss anything).
- The old `coin_lists` table is **dropped** (was never wired into the
  UI; deletion is loss-free).

## Behaviour changes (BREAKING for early users)

| Before | After |
|---|---|
| Run a screener via the dedicated 选币 tab, browse pass/fail | Tell AI "筛 X" inside the workspace; pass-list goes into draft_symbols |
| Backtest 1 symbol at a time via the workspace's symbol picker | Backtest the entire `draft_symbols` array in one shot, results aggregate + drill-down |
| Auto-save (Strategist persona's "summary + code") writes a new strategy whenever AI emits structured output | No auto-save.  Click 保存策略 to commit. |
| Edit `code_type: 'strategy' \| 'screener'` to control tab placement | `code_type` is legacy.  All new rows are unified strategies (filter logic + trading logic in one entity). |
| API key required for chat | Same.  Add it in Settings. |

## Action items

If you are pulling this version onto an existing local install:

1. **Stop the desktop app** (so SQLite isn't locked).
2. **Pull + rebuild** docker stack.  The server migration runs automatically.
3. **Start desktop app**.  Client SQLite migration runs once, transparently.
4. **Verify**: open 策略库, look for any pre-existing strategies — they
   should show "[已保存]" badges.  If they show "[草稿]" instead, file
   an issue (something went sideways with the backfill).

If anything looks off, the docker volume holds your data — you can
`make db-down && make db-up` to reset DB while keeping the SQLite file
intact.  But the migration is idempotent so re-running is safe.

## Rollback

This change is gated behind a feature flag at the route layer
(`feature.unifiedWorkspace.enabled` in client settings).  Setting it
to false reverts the tab layout to v0 and stops using the new
workspace screen — but new strategies and chat sessions written under
v1 will not be visible in v0 (the v0 UI doesn't read the new fields).

For a clean rollback, revert the desktop-client commit AND drop the
new server columns via:

```sql
ALTER TABLE claw.strategies
  DROP COLUMN IF EXISTS draft_code,
  DROP COLUMN IF EXISTS draft_symbols,
  DROP COLUMN IF EXISTS saved_code,
  DROP COLUMN IF EXISTS saved_symbols,
  DROP COLUMN IF EXISTS saved_at,
  DROP COLUMN IF EXISTS last_backtest,
  DROP COLUMN IF EXISTS is_archived_draft;
```

(But really — this is a v1.  Just don't roll back; report the bug.)
