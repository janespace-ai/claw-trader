package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/janespace-ai/claw-trader/service-api/internal/model"
)

// CreateAnalysisRun inserts a new pending analysis task and returns
// the assigned ID.
func (s *Store) CreateAnalysisRun(ctx context.Context, kind string, config []byte) (string, error) {
	var id string
	sqlStr := fmt.Sprintf(`
		INSERT INTO %[1]s.analysis_runs (type, config, status)
		VALUES ($1, $2, 'pending')
		RETURNING id
	`, s.schema)
	err := s.pool.QueryRow(ctx, sqlStr, kind, config).Scan(&id)
	return id, err
}

// GetAnalysisRun reads by ID + type guard. Returns ok=false when the
// row doesn't exist or its type doesn't match.
func (s *Store) GetAnalysisRun(ctx context.Context, id, kind string) (model.AnalysisRun, bool, error) {
	sqlStr := fmt.Sprintf(`
		SELECT id, type, config,
		       status,
		       COALESCE(progress, 'null'::jsonb),
		       COALESCE(result, 'null'::jsonb),
		       COALESCE(error, 'null'::jsonb),
		       started_at, finished_at, created_at
		FROM %[1]s.analysis_runs
		WHERE id = $1 AND type = $2
	`, s.schema)
	var r model.AnalysisRun
	var progress, result, errJSON []byte
	err := s.pool.QueryRow(ctx, sqlStr, id, kind).Scan(
		&r.ID, &r.Type, &r.Config,
		&r.Status, &progress, &result, &errJSON,
		&r.StartedAt, &r.FinishedAt, &r.CreatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return model.AnalysisRun{}, false, nil
		}
		return model.AnalysisRun{}, false, err
	}
	if string(progress) != "null" {
		r.Progress = progress
	}
	if string(result) != "null" {
		r.Result = result
	}
	if string(errJSON) != "null" {
		r.Error = errJSON
	}
	return r, true, nil
}

// UpdateAnalysisRunFailed marks a run as failed with a structured
// error body + finish timestamp.
func (s *Store) UpdateAnalysisRunFailed(ctx context.Context, id string, errBody map[string]any) error {
	body, _ := json.Marshal(errBody)
	sqlStr := fmt.Sprintf(`
		UPDATE %[1]s.analysis_runs
		SET status = 'failed', error = $2, finished_at = $3, started_at = COALESCE(started_at, $3)
		WHERE id = $1
	`, s.schema)
	_, err := s.pool.Exec(ctx, sqlStr, id, body, time.Now().UTC())
	return err
}
