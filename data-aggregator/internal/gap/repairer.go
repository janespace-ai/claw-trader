package gap

import (
	"context"
	"fmt"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/fetcher"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// Repairer attempts to backfill detected gaps using either S3 (for historical ranges)
// or the API (for ranges S3 doesn't cover).
type Repairer struct {
	cfg        config.GapConfig
	store      *store.Store
	s3Fetcher  *fetcher.S3Fetcher
	apiFetcher *fetcher.APIFetcher
}

// NewRepairer builds a repairer bound to both S3 and API fetchers.
func NewRepairer(cfg config.GapConfig, st *store.Store, s3 *fetcher.S3Fetcher, api *fetcher.APIFetcher) *Repairer {
	return &Repairer{cfg: cfg, store: st, s3Fetcher: s3, apiFetcher: api}
}

// ShouldSkip returns true if the gap matches user-configured exclusion rules or is stale.
func (r *Repairer) ShouldSkip(g model.Gap) (bool, string) {
	for _, ex := range r.cfg.ExcludedSymbols {
		if ex == g.Symbol {
			return true, "excluded_symbol"
		}
	}
	for _, ex := range r.cfg.ExcludedRanges {
		if ex.Symbol != "*" && ex.Symbol != g.Symbol {
			continue
		}
		fromT, err1 := time.Parse(time.RFC3339, ex.From)
		toT, err2 := time.Parse(time.RFC3339, ex.To)
		if err1 != nil || err2 != nil {
			continue
		}
		if !g.GapFrom.Before(fromT) && !g.GapTo.After(toT) {
			return true, "excluded_range: " + ex.Reason
		}
	}
	if r.cfg.MaxGapAgeDays > 0 {
		if time.Since(g.GapFrom) > time.Duration(r.cfg.MaxGapAgeDays)*24*time.Hour {
			return true, "gap_too_old"
		}
	}
	return false, ""
}

// RepairGap picks S3 vs API based on the gap range and executes a single repair attempt.
// Returns (rowsInserted, source, error).
func (r *Repairer) RepairGap(ctx context.Context, g model.Gap) (int64, string, error) {
	// Current month boundary: S3 generally only has fully-closed months.
	now := time.Now().UTC()
	currentMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	// If the gap falls entirely inside a month that S3 has, prefer S3.
	if g.GapTo.Before(currentMonthStart) {
		yyyymm := fmt.Sprintf("%04d%02d", g.GapFrom.Year(), int(g.GapFrom.Month()))
		count, err := r.s3Fetcher.FetchAndStore(ctx, makeS3Job(g.Symbol, g.Interval, yyyymm))
		if err == nil {
			return count, "s3", nil
		}
		// Fall through to API on S3 failure.
	}

	// API fallback.
	count, err := r.apiFetcher.FillSymbol(ctx, g.Symbol, g.Interval)
	if err != nil {
		return 0, "api", err
	}
	return count, "api", nil
}

// RepairAll processes every detected gap, applying retry + skip semantics.
func (r *Repairer) RepairAll(ctx context.Context) (int, int, error) {
	gaps, err := r.store.QueryGaps(ctx, store.GapFilter{Status: model.GapStatusDetected, Limit: 10000})
	if err != nil {
		return 0, 0, err
	}

	repaired := 0
	skipped := 0

	for _, g := range gaps {
		if skip, reason := r.ShouldSkip(g); skip {
			skipped++
			_ = r.store.UpdateGapStatus(ctx, g.ID, model.GapStatusSkipped, reason, false)
			continue
		}

		maxRetry := r.cfg.MaxRetryPerGap
		if maxRetry <= 0 {
			maxRetry = 3
		}

		if g.RetryCount >= maxRetry {
			if r.cfg.SkipOnFailure {
				_ = r.store.UpdateGapStatus(ctx, g.ID, model.GapStatusUnrecoverable, "max_retry_exceeded", false)
			}
			continue
		}

		_ = r.store.UpdateGapStatus(ctx, g.ID, model.GapStatusRepairing, "", false)
		_, _, err := r.RepairGap(ctx, g)
		if err != nil {
			_ = r.store.UpdateGapStatus(ctx, g.ID, model.GapStatusDetected, err.Error(), true)
			continue
		}
		_ = r.store.UpdateGapStatus(ctx, g.ID, model.GapStatusDone, "", false)
		repaired++
	}
	return repaired, skipped, nil
}

// makeS3Job is a shim so we can call the s3Fetcher's FetchAndStore which takes a downloadJob.
// Since downloadJob is unexported we wrap via a small adapter in the fetcher package.
// (See fetcher/s3_fetcher.go: BuildJob helper.)
func makeS3Job(symbol, interval, yyyymm string) fetcher.DownloadJob {
	return fetcher.DownloadJob{Symbol: symbol, Interval: interval, YYYYMM: yyyymm}
}
