package store

import (
	"context"
	"fmt"
	"time"
)

// SupportedIntervals enumerates the interval strings matching data-aggregator's
// hypertables `claw.futures_{interval}`. Kept as a package-level slice so the
// handler can validate input and return the allowed values in error payloads.
var SupportedIntervals = []string{"5m", "15m", "30m", "1h", "4h", "1d"}

// IsSupportedInterval reports whether the given interval matches one of the
// futures hypertables that data-aggregator populates.
func IsSupportedInterval(interval string) bool {
	for _, s := range SupportedIntervals {
		if s == interval {
			return true
		}
	}
	return false
}

// Kline mirrors the JSON shape previously returned by data-aggregator's
// /api/klines endpoint. Fields are intentionally single-letter to preserve
// wire compatibility with the desktop-client.
type Kline struct {
	Ts          int64    `json:"ts"`
	O           float64  `json:"o"`
	H           float64  `json:"h"`
	L           float64  `json:"l"`
	C           float64  `json:"c"`
	V           float64  `json:"v"`
	QuoteVolume *float64 `json:"qv,omitempty"`
}

// QueryKlines reads OHLCV rows from the shared Timescale hypertable populated
// by data-aggregator. The caller MUST validate interval via IsSupportedInterval
// before calling; we format it into the table name with no further escaping.
// `from` and `to` are inclusive on both ends. Rows are returned in ascending
// time order.
func (s *Store) QueryKlines(ctx context.Context, market, interval, symbol string, from, to time.Time) ([]Kline, error) {
	if !IsSupportedInterval(interval) {
		return nil, fmt.Errorf("unsupported interval %q", interval)
	}
	if market == "" {
		market = "futures"
	}
	// Table name is {schema}.{market}_{interval} — data-aggregator writes here.
	table := fmt.Sprintf("claw.%s_%s", market, interval)

	query := fmt.Sprintf(`
		SELECT ts, open, high, low, close, volume, quote_volume
		FROM %s
		WHERE symbol = $1 AND ts >= $2 AND ts <= $3
		ORDER BY ts ASC
	`, table)

	rows, err := s.pool.Query(ctx, query, symbol, from, to)
	if err != nil {
		return nil, fmt.Errorf("query klines: %w", err)
	}
	defer rows.Close()

	result := make([]Kline, 0, 1024)
	for rows.Next() {
		var (
			ts                              time.Time
			o, h, l, c, v                   float64
			qv                              *float64
		)
		if err := rows.Scan(&ts, &o, &h, &l, &c, &v, &qv); err != nil {
			return nil, err
		}
		result = append(result, Kline{
			Ts: ts.Unix(), O: o, H: h, L: l, C: c, V: v, QuoteVolume: qv,
		})
	}
	return result, rows.Err()
}

// Symbol mirrors data-aggregator's symbol payload shape.
type Symbol struct {
	Symbol         string    `json:"symbol"`
	Market         string    `json:"market"`
	Rank           *int      `json:"rank"`
	Volume24hQuote float64   `json:"volume_24h_quote"`
	Status         string    `json:"status"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ListActiveSymbols returns ranked active symbols for a given market.
func (s *Store) ListActiveSymbols(ctx context.Context, market string, limit int) ([]Symbol, error) {
	if market == "" {
		market = "futures"
	}
	if limit <= 0 {
		limit = 300
	}
	const sql = `
		SELECT symbol, market, rank, COALESCE(volume_24h_quote, 0), status, updated_at
		FROM claw.symbols
		WHERE market = $1 AND rank IS NOT NULL AND status = 'active'
		ORDER BY rank ASC
		LIMIT $2
	`
	rows, err := s.pool.Query(ctx, sql, market, limit)
	if err != nil {
		return nil, fmt.Errorf("list symbols: %w", err)
	}
	defer rows.Close()

	result := make([]Symbol, 0, limit)
	for rows.Next() {
		var sym Symbol
		var rank *int
		if err := rows.Scan(&sym.Symbol, &sym.Market, &rank, &sym.Volume24hQuote, &sym.Status, &sym.UpdatedAt); err != nil {
			return nil, err
		}
		sym.Rank = rank
		result = append(result, sym)
	}
	return result, rows.Err()
}

// Gap mirrors data-aggregator's gap payload shape.
type Gap struct {
	ID          int64     `json:"id"`
	Symbol      string    `json:"symbol"`
	Market      string    `json:"market"`
	Interval    string    `json:"interval"`
	GapFrom     time.Time `json:"gap_from"`
	GapTo       time.Time `json:"gap_to"`
	MissingBars int       `json:"missing_bars"`
	Status      string    `json:"status"`
	RetryCount  int       `json:"retry_count"`
	LastError   string    `json:"error,omitempty"`
	DetectedAt  time.Time `json:"detected_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// GapFilter narrows QueryGaps results. Empty strings mean "any".
type GapFilter struct {
	Symbol   string
	Market   string
	Interval string
	Status   string
	Limit    int
}

// QueryGaps reads gap records from the shared `claw.gaps` table.
func (s *Store) QueryGaps(ctx context.Context, f GapFilter) ([]Gap, error) {
	conditions := "1=1"
	args := []any{}
	add := func(col, val string) {
		if val == "" {
			return
		}
		args = append(args, val)
		conditions = fmt.Sprintf("%s AND %s = $%d", conditions, col, len(args))
	}
	add("symbol", f.Symbol)
	if f.Market == "" {
		f.Market = "futures"
	}
	add("market", f.Market)
	add("interval", f.Interval)
	add("status", f.Status)

	limit := f.Limit
	if limit <= 0 {
		limit = 500
	}
	args = append(args, limit)
	limitArg := fmt.Sprintf("$%d", len(args))

	sql := fmt.Sprintf(`
		SELECT id, symbol, market, interval, gap_from, gap_to, missing_bars,
		       status, retry_count, COALESCE(error, ''), detected_at, COALESCE(repaired_at, detected_at)
		FROM claw.gaps
		WHERE %s
		ORDER BY detected_at DESC
		LIMIT %s
	`, conditions, limitArg)

	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query gaps: %w", err)
	}
	defer rows.Close()

	result := []Gap{}
	for rows.Next() {
		var g Gap
		if err := rows.Scan(&g.ID, &g.Symbol, &g.Market, &g.Interval,
			&g.GapFrom, &g.GapTo, &g.MissingBars, &g.Status,
			&g.RetryCount, &g.LastError, &g.DetectedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, g)
	}
	return result, rows.Err()
}
