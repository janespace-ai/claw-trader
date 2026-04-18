package gap

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// Detector scans (symbol, interval) series for missing bars using the LEAD window function.
type Detector struct {
	cfg   config.GapConfig
	store *store.Store
}

// NewDetector builds a new gap detector.
func NewDetector(cfg config.GapConfig, st *store.Store) *Detector {
	return &Detector{cfg: cfg, store: st}
}

// DetectOne scans a single (market, symbol, interval) series over [from, to].
// Persists detected gaps to claw.gaps and returns an aggregated report.
func (d *Detector) DetectOne(ctx context.Context, market, symbol, interval string, from, to time.Time) (*model.GapReport, error) {
	intervalDur := model.IntervalDuration(interval)
	if intervalDur == 0 {
		return nil, fmt.Errorf("unsupported interval %q", interval)
	}

	threshold := d.cfg.ThresholdMultiplier
	if threshold <= 0 {
		threshold = 1.5
	}
	table := d.store.TableName(market, interval)

	// Use LEAD() to find adjacent timestamps and flag when the delta exceeds threshold.
	query := fmt.Sprintf(`
		WITH ordered AS (
			SELECT ts,
			       LEAD(ts) OVER (ORDER BY ts) AS next_ts
			FROM %s
			WHERE symbol = $1 AND ts >= $2 AND ts <= $3
		)
		SELECT ts AS gap_from, next_ts AS gap_to
		FROM ordered
		WHERE next_ts IS NOT NULL
		  AND EXTRACT(EPOCH FROM (next_ts - ts)) > $4
		ORDER BY ts
	`, table)

	rows, err := d.store.Pool().Query(ctx, query, symbol, from, to,
		intervalDur.Seconds()*threshold,
	)
	if err != nil {
		return nil, fmt.Errorf("detect gaps query: %w", err)
	}
	defer rows.Close()

	gaps := []model.Gap{}
	for rows.Next() {
		var gFrom, gTo time.Time
		if err := rows.Scan(&gFrom, &gTo); err != nil {
			return nil, err
		}
		missing := int(math.Round(gTo.Sub(gFrom).Seconds()/intervalDur.Seconds())) - 1
		if missing < 1 {
			continue
		}
		gap := model.Gap{
			Symbol:      symbol,
			Market:      market,
			Interval:    interval,
			GapFrom:     gFrom.Add(intervalDur),
			GapTo:       gTo.Add(-intervalDur),
			MissingBars: missing,
			Status:      model.GapStatusDetected,
		}
		if _, err := d.store.InsertGap(ctx, gap); err != nil {
			return nil, err
		}
		gaps = append(gaps, gap)
	}

	// Expected / actual bars for completeness%.
	expectedBars := int64(math.Round(to.Sub(from).Seconds() / intervalDur.Seconds()))
	var actual int64
	countSQL := fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE symbol = $1 AND ts >= $2 AND ts <= $3`, table)
	if err := d.store.Pool().QueryRow(ctx, countSQL, symbol, from, to).Scan(&actual); err != nil {
		return nil, fmt.Errorf("count actual: %w", err)
	}

	completeness := 100.0
	if expectedBars > 0 {
		completeness = (float64(actual) / float64(expectedBars)) * 100.0
	}

	return &model.GapReport{
		Symbol:        symbol,
		Market:        market,
		Interval:      interval,
		From:          from,
		To:            to,
		TotalExpected: expectedBars,
		TotalActual:   actual,
		Completeness:  completeness,
		Gaps:          gaps,
	}, nil
}

// DetectAll scans every (symbol, interval) combination for active symbols,
// returning one report per combination.
func (d *Detector) DetectAll(ctx context.Context, intervals []string, from, to time.Time) ([]model.GapReport, error) {
	symbols, err := d.store.ActiveSymbols(ctx, "futures", 0)
	if err != nil {
		return nil, err
	}

	reports := []model.GapReport{}
	for _, sym := range symbols {
		for _, iv := range intervals {
			r, err := d.DetectOne(ctx, "futures", sym.Symbol, iv, from, to)
			if err != nil {
				continue
			}
			reports = append(reports, *r)
		}
	}
	return reports, nil
}
