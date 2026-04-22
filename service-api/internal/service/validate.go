package service

import (
	"context"
	"fmt"
	"strconv"
	"time"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// MaxSymbolsPerRun is the hard cap on how many symbols one backtest
// run can sweep. Matches the UI's Pencil constraint and the Go
// worker-pool sizing assumption.
const MaxSymbolsPerRun = 50

// DataChecker is a narrow interface so validation is testable without
// a full store instance. Implementations should return true only if
// there's at least one kline row in the requested range.
type DataChecker interface {
	HasKlines(ctx context.Context, market, interval, symbol string, from, to time.Time) (bool, error)
}

// ValidateSubmit checks a BacktestConfig upfront so we never kick off
// sandbox work when a cheap check could have rejected the request.
// Returns an `*apierr.HTTPError` on failure; nil on success.
//
// The checks run in order:
//  1. symbols: non-empty, <= MaxSymbolsPerRun, no duplicates
//  2. interval: must be supported
//  3. range: from/to parse + `to > from`
//  4. mode + lookback: Preview/Deep overrides must match the mode
//  5. per-symbol data availability (if `checker` non-nil)
func ValidateSubmit(ctx context.Context, cfg model.BacktestConfig, market string, checker DataChecker) *apierr.HTTPError {
	// --- 1. symbols
	if len(cfg.Symbols) == 0 {
		return apierr.New(apierr.CodeInvalidSymbol, "symbols list is empty").
			WithDetails(map[string]any{"invalid_symbols": []string{}})
	}
	if len(cfg.Symbols) > MaxSymbolsPerRun {
		return apierr.New(apierr.CodeInvalidSymbol, fmt.Sprintf(
			"too many symbols: %d > %d", len(cfg.Symbols), MaxSymbolsPerRun,
		)).WithDetails(map[string]any{"max": MaxSymbolsPerRun})
	}
	seen := map[string]struct{}{}
	for _, s := range cfg.Symbols {
		if s == "" {
			return apierr.New(apierr.CodeInvalidSymbol, "empty symbol in list").
				WithDetails(map[string]any{"invalid_symbols": []string{""}})
		}
		if _, dup := seen[s]; dup {
			return apierr.New(apierr.CodeInvalidSymbol, "duplicate symbol").
				WithDetails(map[string]any{"invalid_symbols": []string{s}})
		}
		seen[s] = struct{}{}
	}

	// --- 2. interval
	if cfg.Interval == "" {
		return apierr.New(apierr.CodeInvalidInterval, "interval is required").
			WithDetails(map[string]any{"allowed_intervals": store.SupportedIntervals})
	}
	if !store.IsSupportedInterval(cfg.Interval) {
		return apierr.New(apierr.CodeInvalidInterval, "unsupported interval").
			WithDetails(map[string]any{
				"interval":          cfg.Interval,
				"allowed_intervals": store.SupportedIntervals,
			})
	}

	// --- 3. range
	from, errFrom := parseRangeTime(cfg.From)
	if errFrom != nil {
		return apierr.New(apierr.CodeInvalidRange, "bad 'from': "+errFrom.Error())
	}
	to, errTo := parseRangeTime(cfg.To)
	if errTo != nil {
		return apierr.New(apierr.CodeInvalidRange, "bad 'to': "+errTo.Error())
	}
	if !to.After(from) {
		return apierr.New(apierr.CodeInvalidRange, "'to' must be after 'from'")
	}

	// --- 4. mode + lookback
	if cfg.PreviewLookbackDays != nil && *cfg.PreviewLookbackDays <= 0 {
		return apierr.New(apierr.CodeInvalidRange, "preview_lookback_days must be positive")
	}
	if cfg.DeepLookbackDays != nil && *cfg.DeepLookbackDays <= 0 {
		return apierr.New(apierr.CodeInvalidRange, "deep_lookback_days must be positive")
	}

	// --- 5. per-symbol data availability
	if checker == nil {
		return nil
	}
	missing := make([]map[string]any, 0)
	for _, s := range cfg.Symbols {
		ok, err := checker.HasKlines(ctx, market, cfg.Interval, s, from, to)
		if err != nil {
			return apierr.Wrap(err, apierr.CodeUpstreamUnreachable, "data check failed: "+err.Error())
		}
		if !ok {
			missing = append(missing, map[string]any{
				"symbol":        s,
				"missing_range": []int64{from.Unix(), to.Unix()},
			})
		}
	}
	if len(missing) > 0 {
		return apierr.New(apierr.CodeDataUnavailable, "no kline data for one or more symbols").
			WithDetails(map[string]any{"missing": missing})
	}
	return nil
}

// parseRangeTime mirrors the kline handler accept-list: Unix seconds,
// RFC3339, or YYYY-MM-DD.
func parseRangeTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, fmt.Errorf("empty")
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return time.Unix(n, 0).UTC(), nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("unrecognized time format")
}
