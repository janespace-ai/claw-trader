package fetcher

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"sync/atomic"
	"time"

	"golang.org/x/time/rate"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// APIFetcher pulls recent candlesticks from Gate.io API v4 to fill data newer than S3.
type APIFetcher struct {
	cfg     config.GateioConfig
	sync    config.SyncConfig
	store   *store.Store
	client  *http.Client
	limiter *rate.Limiter

	progress APIProgress
}

// APIProgress mirrors S3Progress for the API fetcher.
type APIProgress struct {
	Done   atomic.Int64
	Total  atomic.Int64
	Failed atomic.Int64
}

func (p *APIProgress) Snapshot() model.Counter {
	return model.Counter{Done: p.Done.Load(), Total: p.Total.Load(), Failed: p.Failed.Load()}
}

// NewAPIFetcher constructs the API fetcher with a global rate limiter.
func NewAPIFetcher(gcfg config.GateioConfig, scfg config.SyncConfig, st *store.Store) *APIFetcher {
	rl := rate.NewLimiter(rate.Limit(gcfg.RateLimitPerSec), gcfg.RateLimitPerSec)
	return &APIFetcher{
		cfg:   gcfg,
		sync:  scfg,
		store: st,
		client: &http.Client{
			Timeout: time.Duration(gcfg.RequestTimeoutSec) * time.Second,
		},
		limiter: rl,
	}
}

// Progress exposes the running counters.
func (f *APIFetcher) Progress() model.Counter { return f.progress.Snapshot() }

// gateioCandle mirrors the Gate.io candlesticks response format.
// Fields come back as strings; "t" is unix seconds.
type gateioCandle struct {
	T string `json:"t"`
	V string `json:"v"`  // contract volume
	C string `json:"c"`
	H string `json:"h"`
	L string `json:"l"`
	O string `json:"o"`
	SumValue string `json:"sum"` // optional: quote volume on some endpoints
}

// FillSymbol fills the gap between the most recent DB timestamp and now() for
// a single (symbol, interval), using paginated API calls.
func (f *APIFetcher) FillSymbol(ctx context.Context, symbol, interval string) (int64, error) {
	latest, err := f.store.LatestTimestamp(ctx, "futures", interval, symbol)
	if err != nil {
		return 0, err
	}

	intervalDur := model.IntervalDuration(interval)
	if intervalDur == 0 {
		return 0, fmt.Errorf("unsupported interval %q", interval)
	}

	// Start one bar after the last known ts.
	startFrom := latest.Add(intervalDur)
	if latest.IsZero() {
		// No data yet: pull the last ~1000 bars as a fallback window.
		startFrom = time.Now().UTC().Add(-1000 * intervalDur)
	}
	now := time.Now().UTC()

	if !startFrom.Before(now) {
		return 0, nil
	}

	totalRows := int64(0)
	cursor := startFrom
	const pageLimit = 2000

	for cursor.Before(now) {
		if err := f.limiter.Wait(ctx); err != nil {
			return totalRows, err
		}

		rows, err := f.fetchPage(ctx, symbol, interval, cursor, pageLimit)
		if err != nil {
			return totalRows, err
		}
		if len(rows) == 0 {
			break
		}

		count, err := f.store.CopyCandles(ctx, "futures", interval, rows)
		if err != nil {
			return totalRows, err
		}
		totalRows += count

		// Advance cursor past the latest bar we just stored.
		lastTs := rows[len(rows)-1].Ts
		if !lastTs.After(cursor) {
			// Avoid infinite loop if API returned stale data.
			break
		}
		cursor = lastTs.Add(intervalDur)

		// If we got fewer than a full page, we've caught up.
		if len(rows) < pageLimit {
			break
		}
	}
	return totalRows, nil
}

// fetchPage requests a single page of candles starting from `from` with size `limit`.
func (f *APIFetcher) fetchPage(ctx context.Context, symbol, interval string, from time.Time, limit int) ([]model.Candlestick, error) {
	q := url.Values{}
	q.Set("contract", symbol)
	q.Set("interval", interval)
	q.Set("from", strconv.FormatInt(from.Unix(), 10))
	q.Set("limit", strconv.Itoa(limit))

	reqURL := f.cfg.APIBaseURL + f.cfg.CandlesEndpoint + "?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api GET candles -> %d: %s", resp.StatusCode, string(body))
	}

	var raw []gateioCandle
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode candles: %w", err)
	}

	result := make([]model.Candlestick, 0, len(raw))
	for _, r := range raw {
		tsSec, err := strconv.ParseInt(r.T, 10, 64)
		if err != nil {
			continue
		}
		o, _ := strconv.ParseFloat(r.O, 64)
		h, _ := strconv.ParseFloat(r.H, 64)
		l, _ := strconv.ParseFloat(r.L, 64)
		c, _ := strconv.ParseFloat(r.C, 64)
		v, _ := strconv.ParseFloat(r.V, 64)

		candle := model.Candlestick{
			Ts:     time.Unix(tsSec, 0).UTC(),
			Symbol: symbol,
			Open:   o,
			High:   h,
			Low:    l,
			Close:  c,
			Volume: v,
		}
		if r.SumValue != "" {
			if sv, err := strconv.ParseFloat(r.SumValue, 64); err == nil {
				candle.QuoteVolume = &sv
			}
		}
		result = append(result, candle)
	}
	return result, nil
}

// FillAll runs FillSymbol across the cross product of given symbols and configured API intervals.
// Sequential per-symbol to respect the global rate limiter cleanly.
func (f *APIFetcher) FillAll(ctx context.Context, symbols []string) error {
	intervals := f.sync.APIIntervals
	if len(intervals) == 0 {
		intervals = model.SupportedIntervals
	}
	f.progress.Done.Store(0)
	f.progress.Failed.Store(0)
	f.progress.Total.Store(int64(len(symbols) * len(intervals)))

	for _, sym := range symbols {
		for _, iv := range intervals {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			rows, err := f.FillSymbol(ctx, sym, iv)
			if err != nil {
				f.progress.Failed.Add(1)
				_ = f.store.UpsertSyncState(ctx, model.SyncState{
					Symbol: sym, Market: "futures", Interval: iv,
					Source: "api", Period: "api",
					Status: model.SyncStatusFailed, Error: err.Error(),
				})
				continue
			}
			f.progress.Done.Add(1)
			_ = f.store.UpsertSyncState(ctx, model.SyncState{
				Symbol: sym, Market: "futures", Interval: iv,
				Source: "api", Period: "api",
				Status: model.SyncStatusDone, RowCount: rows,
			})
		}
	}
	return nil
}
