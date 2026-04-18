package aggregator

import (
	"context"
	"fmt"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// Aggregator builds 15m / 30m hypertables by aggregating from futures_5m
// using TimescaleDB's time_bucket + first/last window functions.
type Aggregator struct {
	store *store.Store
}

// New returns a new Aggregator bound to a store.
func New(st *store.Store) *Aggregator { return &Aggregator{store: st} }

// AggregateAll runs 15m and 30m aggregation for all symbols + all time.
// Uses ON CONFLICT DO NOTHING so reruns are idempotent.
func (a *Aggregator) AggregateAll(ctx context.Context) error {
	if err := a.Aggregate(ctx, "15m", time.Time{}, time.Time{}); err != nil {
		return fmt.Errorf("aggregate 15m: %w", err)
	}
	if err := a.Aggregate(ctx, "30m", time.Time{}, time.Time{}); err != nil {
		return fmt.Errorf("aggregate 30m: %w", err)
	}
	return nil
}

// Aggregate runs 5m -> target (15m or 30m) aggregation, optionally scoped to [from, to].
// Zero-valued from/to means "all data".
func (a *Aggregator) Aggregate(ctx context.Context, targetInterval string, from, to time.Time) error {
	if targetInterval != "15m" && targetInterval != "30m" {
		return fmt.Errorf("unsupported aggregation target %q", targetInterval)
	}
	bucket := "INTERVAL '15 minutes'"
	if targetInterval == "30m" {
		bucket = "INTERVAL '30 minutes'"
	}

	src := a.store.TableName("futures", "5m")
	dst := a.store.TableName("futures", targetInterval)

	where := "1=1"
	args := []any{}
	if !from.IsZero() {
		args = append(args, from)
		where += fmt.Sprintf(" AND ts >= $%d", len(args))
	}
	if !to.IsZero() {
		args = append(args, to)
		where += fmt.Sprintf(" AND ts <= $%d", len(args))
	}

	sql := fmt.Sprintf(`
		INSERT INTO %s (ts, symbol, open, high, low, close, volume, quote_volume)
		SELECT
			time_bucket(%s, ts)                                             AS ts,
			symbol,
			first(open, ts)                                                 AS open,
			max(high)                                                       AS high,
			min(low)                                                        AS low,
			last(close, ts)                                                 AS close,
			sum(volume)                                                     AS volume,
			NULLIF(sum(COALESCE(quote_volume, 0)), 0)                       AS quote_volume
		FROM %s
		WHERE %s
		GROUP BY time_bucket(%s, ts), symbol
		ON CONFLICT (symbol, ts) DO NOTHING
	`, dst, bucket, src, where, bucket)

	_, err := a.store.Pool().Exec(ctx, sql, args...)
	if err != nil {
		return fmt.Errorf("aggregate %s: %w", targetInterval, err)
	}
	return nil
}

// AggregateSymbolRange aggregates a specific (symbol, month) range — used after fresh S3
// downloads to avoid reprocessing the entire history every time.
func (a *Aggregator) AggregateSymbolRange(ctx context.Context, symbol string, from, to time.Time) error {
	src := a.store.TableName("futures", "5m")

	for _, target := range []string{"15m", "30m"} {
		bucket := "INTERVAL '15 minutes'"
		if target == "30m" {
			bucket = "INTERVAL '30 minutes'"
		}
		dst := a.store.TableName("futures", target)

		sql := fmt.Sprintf(`
			INSERT INTO %s (ts, symbol, open, high, low, close, volume, quote_volume)
			SELECT
				time_bucket(%s, ts) AS ts,
				symbol,
				first(open, ts)     AS open,
				max(high)           AS high,
				min(low)            AS low,
				last(close, ts)     AS close,
				sum(volume)         AS volume,
				NULLIF(sum(COALESCE(quote_volume, 0)), 0) AS quote_volume
			FROM %s
			WHERE symbol = $1 AND ts >= $2 AND ts <= $3
			GROUP BY time_bucket(%s, ts), symbol
			ON CONFLICT (symbol, ts) DO NOTHING
		`, dst, bucket, src, bucket)

		if _, err := a.store.Pool().Exec(ctx, sql, symbol, from, to); err != nil {
			return fmt.Errorf("aggregate %s for %s: %w", target, symbol, err)
		}
	}
	return nil
}
