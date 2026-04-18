package store

import (
	"context"
	"fmt"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
)

// UpsertSyncState records or updates a (symbol, market, interval, source, period) row.
func (s *Store) UpsertSyncState(ctx context.Context, st model.SyncState) error {
	const sql = `
		INSERT INTO claw.sync_state
			(symbol, market, interval, source, period, status, row_count, error, synced_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
		ON CONFLICT (symbol, market, interval, source, period)
		DO UPDATE SET status = EXCLUDED.status,
		              row_count = EXCLUDED.row_count,
		              error = EXCLUDED.error,
		              synced_at = now()
	`
	_, err := s.pool.Exec(ctx, sql,
		st.Symbol, st.Market, st.Interval, st.Source, st.Period, st.Status, st.RowCount, st.Error,
	)
	if err != nil {
		return fmt.Errorf("upsert sync_state: %w", err)
	}
	return nil
}

// CompletedPeriods returns the periods that have status='done' for a given
// (symbol, market, interval, source) tuple. Used by incremental sync to skip work.
func (s *Store) CompletedPeriods(ctx context.Context, symbol, market, interval, source string) (map[string]struct{}, error) {
	const sql = `
		SELECT period FROM claw.sync_state
		WHERE symbol = $1 AND market = $2 AND interval = $3 AND source = $4 AND status = 'done'
	`
	rows, err := s.pool.Query(ctx, sql, symbol, market, interval, source)
	if err != nil {
		return nil, fmt.Errorf("query completed periods: %w", err)
	}
	defer rows.Close()

	done := make(map[string]struct{})
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		done[p] = struct{}{}
	}
	return done, rows.Err()
}

// GetSyncState reads a specific sync_state row, returning ok=false if absent.
func (s *Store) GetSyncState(ctx context.Context, symbol, market, interval, source, period string) (model.SyncState, bool, error) {
	const sql = `
		SELECT symbol, market, interval, source, period, status, row_count,
		       COALESCE(error, ''), synced_at
		FROM claw.sync_state
		WHERE symbol = $1 AND market = $2 AND interval = $3 AND source = $4 AND period = $5
	`
	var st model.SyncState
	err := s.pool.QueryRow(ctx, sql, symbol, market, interval, source, period).Scan(
		&st.Symbol, &st.Market, &st.Interval, &st.Source, &st.Period,
		&st.Status, &st.RowCount, &st.Error, &st.SyncedAt,
	)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return model.SyncState{}, false, nil
		}
		return model.SyncState{}, false, err
	}
	return st, true, nil
}
