package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// DataRange returns the earliest and latest timestamps present in any
// supported interval table. Uses futures_1h as the canonical reference;
// falls back to 5m if 1h is empty. Returns zero-time when no data at all.
func (s *Store) DataRange(ctx context.Context) (from, to time.Time, err error) {
	for _, iv := range []string{"1h", "5m", "1d"} {
		sqlStr := fmt.Sprintf(`SELECT MIN(ts), MAX(ts) FROM %[1]s.futures_%[2]s`, s.schema, iv)
		var fromN, toN sql.NullTime
		if err := s.pool.QueryRow(ctx, sqlStr).Scan(&fromN, &toN); err != nil {
			if strings.Contains(err.Error(), "does not exist") {
				continue
			}
			return time.Time{}, time.Time{}, err
		}
		if fromN.Valid && toN.Valid {
			return fromN.Time, toN.Time, nil
		}
	}
	return time.Time{}, time.Time{}, nil
}

// LastAggregatorSync returns the most recent successful aggregator sync
// timestamp, or nil if the sync_state table is empty / missing.
func (s *Store) LastAggregatorSync(ctx context.Context) (*time.Time, error) {
	sqlStr := fmt.Sprintf(
		`SELECT MAX(synced_at) FROM %[1]s.sync_state WHERE status='done'`,
		s.schema,
	)
	var ts sql.NullTime
	if err := s.pool.QueryRow(ctx, sqlStr).Scan(&ts); err != nil {
		// Non-fatal: table may not exist on a fresh DB.
		if strings.Contains(err.Error(), "does not exist") {
			return nil, nil
		}
		return nil, err
	}
	if !ts.Valid {
		return nil, nil
	}
	t := ts.Time
	return &t, nil
}

// SymbolRow returns core symbol-metadata fields from claw.symbols.
func (s *Store) SymbolRow(ctx context.Context, symbol string) (row SymbolRowResult, ok bool, err error) {
	sqlStr := fmt.Sprintf(`
		SELECT symbol, market, COALESCE(rank, 0), COALESCE(volume_24h_quote, 0), status
		FROM %[1]s.symbols
		WHERE symbol = $1
		LIMIT 1
	`, s.schema)
	err = s.pool.QueryRow(ctx, sqlStr, symbol).Scan(
		&row.Symbol, &row.Market, &row.Rank, &row.Volume24h, &row.Status,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return SymbolRowResult{}, false, nil
		}
		return SymbolRowResult{}, false, err
	}
	return row, true, nil
}

// SymbolRowResult is a narrow view of claw.symbols for metadata lookups.
type SymbolRowResult struct {
	Symbol    string
	Market    string
	Rank      int
	Volume24h float64
	Status    string
}

// LastKlineInfo returns the first + last kline timestamps and last close
// price for a symbol, preferring the 1h series and falling back to 5m.
func (s *Store) LastKlineInfo(ctx context.Context, symbol string) (firstTs, lastTs time.Time, lastClose float64, err error) {
	for _, iv := range []string{"1h", "5m"} {
		table := fmt.Sprintf("%s.futures_%s", s.schema, iv)
		var firstN, lastN sql.NullTime
		var closeN sql.NullFloat64
		sqlStr := fmt.Sprintf(`
			SELECT MIN(ts), MAX(ts),
			       (SELECT close FROM %[1]s WHERE symbol=$1 ORDER BY ts DESC LIMIT 1)
			FROM %[1]s
			WHERE symbol=$1
		`, table)
		if e := s.pool.QueryRow(ctx, sqlStr, symbol).Scan(&firstN, &lastN, &closeN); e == nil {
			if firstN.Valid && lastN.Valid {
				lc := 0.0
				if closeN.Valid {
					lc = closeN.Float64
				}
				return firstN.Time, lastN.Time, lc, nil
			}
			continue
		} else if strings.Contains(e.Error(), "does not exist") {
			continue
		} else {
			return time.Time{}, time.Time{}, 0, e
		}
	}
	return time.Time{}, time.Time{}, 0, nil
}

// CloseAtOrBefore returns the last close price for a symbol at or
// before the given timestamp. Used for 24h change calculations.
func (s *Store) CloseAtOrBefore(ctx context.Context, symbol string, at time.Time) (price float64, found bool, err error) {
	for _, iv := range []string{"1h", "5m"} {
		table := fmt.Sprintf("%s.futures_%s", s.schema, iv)
		sqlStr := fmt.Sprintf(`
			SELECT close FROM %[1]s
			WHERE symbol=$1 AND ts <= $2
			ORDER BY ts DESC
			LIMIT 1
		`, table)
		var closeN sql.NullFloat64
		if e := s.pool.QueryRow(ctx, sqlStr, symbol, at).Scan(&closeN); e == nil {
			if closeN.Valid {
				return closeN.Float64, true, nil
			}
			continue
		} else if strings.Contains(e.Error(), "no rows") || strings.Contains(e.Error(), "does not exist") {
			continue
		} else {
			return 0, false, e
		}
	}
	return 0, false, nil
}
