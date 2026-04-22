package aireview

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditRecord is one row of `claw.ai_review_audit`.  Every Gate 2 decision
// — cache hit or miss, approve or reject — appends one record.  Append-only;
// never read by the hot path.
//
// The audit is the canonical forensic source when a user asks "why was my
// code rejected?".  We keep the reason + dimensions the model returned so
// an operator can reconstruct the decision even long after the model itself
// has been retired.
type AuditRecord struct {
	TaskID     string
	CodeHash   string
	Model      string
	Verdict    string
	Reason     string
	Dimensions map[string]string
	CacheHit   bool
	LatencyMs  int
}

// Auditor writes to `claw.ai_review_audit`.  Pool-owned; the caller is
// responsible for keeping the pool alive for the auditor's lifetime.
type Auditor struct {
	pool   *pgxpool.Pool
	schema string
}

func NewAuditor(pool *pgxpool.Pool, schema string) *Auditor {
	return &Auditor{pool: pool, schema: schema}
}

// Record appends one audit row.
//
// This method is called from the hot path (every submit goes through here),
// so failures are tolerated — we log via the returned error but the caller
// is free to swallow it.  An audit gap is recoverable; blocking user code
// execution because the audit table was temporarily unreachable is not.
func (a *Auditor) Record(ctx context.Context, rec AuditRecord) error {
	dimsJSON, err := json.Marshal(rec.Dimensions)
	if err != nil {
		// Fall back to empty map — we'd rather lose the dimensions field
		// than lose the row.
		dimsJSON = []byte("{}")
	}
	var taskID any
	if rec.TaskID != "" {
		taskID = rec.TaskID
	} else {
		taskID = nil
	}
	_, err = a.pool.Exec(ctx, fmt.Sprintf(`
		INSERT INTO %s.ai_review_audit
		    (task_id, code_hash, model, verdict, reason, dimensions, cache_hit, latency_ms)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, a.schema),
		taskID, rec.CodeHash, rec.Model, rec.Verdict, rec.Reason,
		dimsJSON, rec.CacheHit, rec.LatencyMs,
	)
	if err != nil {
		return fmt.Errorf("audit insert: %w", err)
	}
	return nil
}
