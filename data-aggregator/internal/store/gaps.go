package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
)

// InsertGap adds a new gap record or updates retry_count when the range already exists.
func (s *Store) InsertGap(ctx context.Context, g model.Gap) (int64, error) {
	sql := fmt.Sprintf(`
		INSERT INTO %s.gaps
			(symbol, market, interval, gap_from, gap_to, missing_bars, status, retry_count, error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (symbol, market, interval, gap_from, gap_to)
		DO UPDATE SET missing_bars = EXCLUDED.missing_bars
		RETURNING id
	`, s.schema)
	var id int64
	err := s.pool.QueryRow(ctx, sql,
		g.Symbol, g.Market, g.Interval, g.GapFrom, g.GapTo, g.MissingBars, g.Status, g.RetryCount, g.LastError,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert gap: %w", err)
	}
	return id, nil
}

// UpdateGapStatus marks a gap with the new status, optional error, and retry increment.
func (s *Store) UpdateGapStatus(ctx context.Context, id int64, status string, lastError string, incrementRetry bool) error {
	retryExpr := ""
	if incrementRetry {
		retryExpr = ", retry_count = retry_count + 1"
	}
	repairedExpr := ""
	if status == model.GapStatusDone {
		repairedExpr = ", repaired_at = now()"
	}

	sql := fmt.Sprintf(
		`UPDATE %s.gaps SET status = $1, error = $2%s%s WHERE id = $3`,
		s.schema, retryExpr, repairedExpr,
	)
	_, err := s.pool.Exec(ctx, sql, status, lastError, id)
	if err != nil {
		return fmt.Errorf("update gap status: %w", err)
	}
	return nil
}

// GapFilter narrows QueryGaps results.
type GapFilter struct {
	Symbol   string
	Market   string
	Interval string
	Status   string // '' = any
	Limit    int
}

// QueryGaps returns gaps matching the filter. Unset string fields mean "any".
func (s *Store) QueryGaps(ctx context.Context, f GapFilter) ([]model.Gap, error) {
	conditions := []string{"1=1"}
	args := []any{}
	add := func(col, val string) {
		if val == "" {
			return
		}
		args = append(args, val)
		conditions = append(conditions, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	add("symbol", f.Symbol)
	add("market", f.Market)
	add("interval", f.Interval)
	add("status", f.Status)

	limit := f.Limit
	if limit <= 0 {
		limit = 500
	}
	args = append(args, limit)
	limitArg := fmt.Sprintf("$%d", len(args))

	sql := fmt.Sprintf(
		`SELECT id, symbol, market, interval, gap_from, gap_to, missing_bars,
		        status, retry_count, COALESCE(error, ''), detected_at, COALESCE(repaired_at, detected_at)
		 FROM %s.gaps
		 WHERE %s
		 ORDER BY detected_at DESC
		 LIMIT %s`,
		s.schema, strings.Join(conditions, " AND "), limitArg,
	)

	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query gaps: %w", err)
	}
	defer rows.Close()

	result := []model.Gap{}
	for rows.Next() {
		var g model.Gap
		if err := rows.Scan(&g.ID, &g.Symbol, &g.Market, &g.Interval,
			&g.GapFrom, &g.GapTo, &g.MissingBars, &g.Status,
			&g.RetryCount, &g.LastError, &g.DetectedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, g)
	}
	return result, rows.Err()
}

// DeleteGapsBefore removes gaps detected before the given cutoff. Useful for reruns.
func (s *Store) DeleteGapsBefore(ctx context.Context, symbol, market, interval string, cutoff time.Time) error {
	sql := fmt.Sprintf(`
		DELETE FROM %s.gaps
		WHERE symbol = $1 AND market = $2 AND interval = $3 AND detected_at < $4
	`, s.schema)
	_, err := s.pool.Exec(ctx, sql, symbol, market, interval, cutoff)
	return err
}
