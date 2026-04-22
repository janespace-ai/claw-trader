package aireview

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Cache persists verdicts in `claw.ai_review_cache`.  See migration 005.
//
// The cache is keyed on the normalized-code sha256; value includes the
// verdict, model name, and per-dimension breakdown.  TTL'd via expires_at.
// Readers ignore expired rows (no background sweeper — stale rows are
// functionally invisible and the operator can periodically prune).
type Cache struct {
	pool   *pgxpool.Pool
	schema string
	ttl    time.Duration
}

// NewCache wires a cache against the given pool + schema.
// ttlDays < 1 falls back to 30 days.
func NewCache(pool *pgxpool.Pool, schema string, ttlDays int) *Cache {
	if ttlDays < 1 {
		ttlDays = 30
	}
	return &Cache{
		pool:   pool,
		schema: schema,
		ttl:    time.Duration(ttlDays) * 24 * time.Hour,
	}
}

// Get returns the cached verdict for ``codeHash`` if one exists AND has not
// expired AND was produced by ``model`` (model-drift check — stale verdicts
// from a previous model are silently ignored).
//
// Returns (nil, nil) on cache miss — NOT an error.  An error is returned
// only for infrastructure failures (pool closed, SQL syntax error).
func (c *Cache) Get(ctx context.Context, codeHash, model string) (*Verdict, error) {
	row := c.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT verdict, reason, model, dimensions, created_at, expires_at
		FROM %s.ai_review_cache
		WHERE code_hash = $1 AND model = $2 AND expires_at > now()
	`, c.schema), codeHash, model)

	var v Verdict
	var dimsJSON []byte
	err := row.Scan(&v.Verdict, &v.Reason, &v.Model, &dimsJSON, &v.CreatedAt, &v.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("cache get: %w", err)
	}
	if len(dimsJSON) > 0 {
		if err := json.Unmarshal(dimsJSON, &v.Dimensions); err != nil {
			// Corrupt row — treat as miss, don't fail the caller.
			return nil, nil
		}
	}
	v.CodeHash = codeHash
	return &v, nil
}

// Put upserts a verdict.  ``expires_at`` is ``now() + ttl``.
//
// An UPSERT is used (not INSERT) because two concurrent requests with the
// same code can race past the cache-miss check — the second writer would
// otherwise get a PK violation.
func (c *Cache) Put(ctx context.Context, v Verdict) error {
	dimsJSON, err := json.Marshal(v.Dimensions)
	if err != nil {
		return fmt.Errorf("marshal dimensions: %w", err)
	}
	_, err = c.pool.Exec(ctx, fmt.Sprintf(`
		INSERT INTO %s.ai_review_cache
		    (code_hash, verdict, reason, model, dimensions, expires_at)
		VALUES ($1, $2, $3, $4, $5, now() + $6::interval)
		ON CONFLICT (code_hash) DO UPDATE
		    SET verdict    = EXCLUDED.verdict,
		        reason     = EXCLUDED.reason,
		        model      = EXCLUDED.model,
		        dimensions = EXCLUDED.dimensions,
		        expires_at = EXCLUDED.expires_at,
		        created_at = now()
	`, c.schema),
		v.CodeHash, v.Verdict, v.Reason, v.Model, dimsJSON,
		fmt.Sprintf("%d seconds", int64(c.ttl.Seconds())),
	)
	if err != nil {
		return fmt.Errorf("cache put: %w", err)
	}
	return nil
}

// PurgeModelDrift deletes rows whose model != ``currentModel``.
//
// Called at service startup.  Cheap and idempotent; running it on a clean
// cache is a no-op.  This protects us from the scenario where an operator
// flips the model in config.yaml — we don't want the new model to get
// "approved" from a cached verdict of the old model.
func (c *Cache) PurgeModelDrift(ctx context.Context, currentModel string) (int64, error) {
	tag, err := c.pool.Exec(ctx, fmt.Sprintf(`
		DELETE FROM %s.ai_review_cache WHERE model <> $1
	`, c.schema), currentModel)
	if err != nil {
		return 0, fmt.Errorf("purge model drift: %w", err)
	}
	return tag.RowsAffected(), nil
}
