package fetcher

import (
	"compress/gzip"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// ErrObjectNotFound is returned when S3 has no file for the requested (symbol, interval, month).
var ErrObjectNotFound = errors.New("s3 object not found")

// S3Fetcher downloads historical candlestick CSVs from the Gate.io public bucket.
type S3Fetcher struct {
	cfg    config.GateioConfig
	sync   config.SyncConfig
	store  *store.Store
	client *http.Client

	progress S3Progress
}

// S3Progress is an atomic snapshot of fetch counters.
type S3Progress struct {
	Done   atomic.Int64
	Total  atomic.Int64
	Failed atomic.Int64
}

// Snapshot returns a plain-value counter for the status API.
func (p *S3Progress) Snapshot() model.Counter {
	return model.Counter{
		Done:   p.Done.Load(),
		Total:  p.Total.Load(),
		Failed: p.Failed.Load(),
	}
}

// NewS3Fetcher constructs a fetcher with its own HTTP client.
func NewS3Fetcher(gcfg config.GateioConfig, scfg config.SyncConfig, st *store.Store) *S3Fetcher {
	return &S3Fetcher{
		cfg:   gcfg,
		sync:  scfg,
		store: st,
		client: &http.Client{
			Timeout: time.Duration(gcfg.RequestTimeoutSec) * time.Second,
		},
	}
}

// Progress exposes the running counters.
func (f *S3Fetcher) Progress() model.Counter { return f.progress.Snapshot() }

// DownloadJob is one (symbol, interval, yyyymm) unit of work.
// Exported so other packages (e.g. gap repairer) can construct jobs directly.
type DownloadJob struct {
	Symbol   string
	Interval string
	YYYYMM   string
}

// BuildURL fills in the configured S3 path template.
func (f *S3Fetcher) BuildURL(symbol, interval, yyyymm string) string {
	path := f.cfg.S3PathTemplate
	path = strings.ReplaceAll(path, "{interval}", interval)
	path = strings.ReplaceAll(path, "{yyyymm}", yyyymm)
	path = strings.ReplaceAll(path, "{pair}", symbol)
	return strings.TrimRight(f.cfg.S3BaseURL, "/") + "/" + strings.TrimLeft(path, "/")
}

// FetchAndStore downloads one file, parses CSV with column remapping, and writes via COPY.
// On success it records sync_state status='done'; on failure status='failed' with error.
func (f *S3Fetcher) FetchAndStore(ctx context.Context, job DownloadJob) (int64, error) {
	url := f.BuildURL(job.Symbol, job.Interval, job.YYYYMM)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		// fall through
	case http.StatusNotFound:
		return 0, ErrObjectNotFound
	default:
		return 0, fmt.Errorf("s3 GET %s -> %d", url, resp.StatusCode)
	}

	gzReader, err := gzip.NewReader(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("gzip open: %w", err)
	}
	defer gzReader.Close()

	rows, err := parseGateS3CSV(gzReader, job.Symbol)
	if err != nil {
		return 0, fmt.Errorf("parse csv: %w", err)
	}

	count, err := f.store.CopyCandles(ctx, "futures", job.Interval, rows)
	if err != nil {
		return 0, fmt.Errorf("copy candles: %w", err)
	}
	return count, nil
}

// parseGateS3CSV consumes the Gate.io S3 CSV (no header) with column order
// [timestamp, volume, close, high, low, open] and remaps to Candlestick.
func parseGateS3CSV(r io.Reader, symbol string) ([]model.Candlestick, error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1

	result := make([]model.Candlestick, 0, 8928) // ~31 * 24 * 12 5m bars
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if len(record) < 6 {
			continue
		}
		tsSec, err := strconv.ParseInt(strings.TrimSpace(record[0]), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("bad timestamp %q: %w", record[0], err)
		}
		volume, err := strconv.ParseFloat(strings.TrimSpace(record[1]), 64)
		if err != nil {
			return nil, fmt.Errorf("bad volume: %w", err)
		}
		closePx, err := strconv.ParseFloat(strings.TrimSpace(record[2]), 64)
		if err != nil {
			return nil, fmt.Errorf("bad close: %w", err)
		}
		high, err := strconv.ParseFloat(strings.TrimSpace(record[3]), 64)
		if err != nil {
			return nil, fmt.Errorf("bad high: %w", err)
		}
		low, err := strconv.ParseFloat(strings.TrimSpace(record[4]), 64)
		if err != nil {
			return nil, fmt.Errorf("bad low: %w", err)
		}
		open, err := strconv.ParseFloat(strings.TrimSpace(record[5]), 64)
		if err != nil {
			return nil, fmt.Errorf("bad open: %w", err)
		}

		result = append(result, model.Candlestick{
			Ts:     time.Unix(tsSec, 0).UTC(),
			Symbol: symbol,
			Open:   open,
			High:   high,
			Low:    low,
			Close:  closePx,
			Volume: volume,
		})
	}
	return result, nil
}

// GenerateJobs produces the full set of (symbol × interval × month) jobs
// given the symbol list and configured months-back window.
func (f *S3Fetcher) GenerateJobs(symbols []string) []DownloadJob {
	jobs := []DownloadJob{}
	now := time.Now().UTC()
	// monthsBack includes the current month but S3 may not have it yet; caller can filter.
	months := f.sync.MonthsBack
	if months <= 0 {
		months = 12
	}
	for _, sym := range symbols {
		for _, interval := range f.sync.S3Intervals {
			for m := 1; m <= months; m++ {
				// Last fully-closed month back.
				t := now.AddDate(0, -m, 0)
				yyyymm := fmt.Sprintf("%04d%02d", t.Year(), int(t.Month()))
				jobs = append(jobs, DownloadJob{Symbol: sym, Interval: interval, YYYYMM: yyyymm})
			}
		}
	}
	return jobs
}

// FilterCompleted removes jobs already marked status='done' in sync_state.
func (f *S3Fetcher) FilterCompleted(ctx context.Context, jobs []DownloadJob) ([]DownloadJob, error) {
	// Group by (symbol, interval) -> set of completed periods, one query each.
	type key struct{ symbol, interval string }
	grouped := make(map[key]map[string]struct{})

	for _, j := range jobs {
		k := key{j.Symbol, j.Interval}
		if _, ok := grouped[k]; ok {
			continue
		}
		periods, err := f.store.CompletedPeriods(ctx, j.Symbol, "futures", j.Interval, "s3")
		if err != nil {
			return nil, err
		}
		grouped[k] = periods
	}

	remaining := jobs[:0]
	for _, j := range jobs {
		if _, done := grouped[key{j.Symbol, j.Interval}][j.YYYYMM]; done {
			continue
		}
		remaining = append(remaining, j)
	}
	return remaining, nil
}

// RunWorkerPool processes jobs with configured concurrency and per-job retry (exponential backoff).
// Updates progress counters and sync_state inline.
func (f *S3Fetcher) RunWorkerPool(ctx context.Context, jobs []DownloadJob) error {
	f.progress.Done.Store(0)
	f.progress.Failed.Store(0)
	f.progress.Total.Store(int64(len(jobs)))

	concurrency := f.sync.Concurrency
	if concurrency <= 0 {
		concurrency = 50
	}
	jobCh := make(chan DownloadJob)
	var wg sync.WaitGroup

	worker := func() {
		defer wg.Done()
		for j := range jobCh {
			count, err := f.runWithRetry(ctx, j)
			if ctx.Err() != nil {
				return
			}
			if err != nil && !errors.Is(err, ErrObjectNotFound) {
				f.progress.Failed.Add(1)
				_ = f.store.UpsertSyncState(ctx, model.SyncState{
					Symbol: j.Symbol, Market: "futures", Interval: j.Interval,
					Source: "s3", Period: j.YYYYMM,
					Status: model.SyncStatusFailed, Error: err.Error(),
				})
				continue
			}
			f.progress.Done.Add(1)
			status := model.SyncStatusDone
			if errors.Is(err, ErrObjectNotFound) {
				status = model.SyncStatusSkipped
			}
			_ = f.store.UpsertSyncState(ctx, model.SyncState{
				Symbol: j.Symbol, Market: "futures", Interval: j.Interval,
				Source: "s3", Period: j.YYYYMM,
				Status: status, RowCount: count,
			})
		}
	}

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go worker()
	}

	for _, j := range jobs {
		select {
		case <-ctx.Done():
			break
		case jobCh <- j:
		}
	}
	close(jobCh)
	wg.Wait()

	return ctx.Err()
}

func (f *S3Fetcher) runWithRetry(ctx context.Context, job DownloadJob) (int64, error) {
	max := f.sync.MaxRetry
	if max <= 0 {
		max = 3
	}
	backoff := time.Duration(f.sync.RetryBackoffSec) * time.Second
	if backoff <= 0 {
		backoff = 2 * time.Second
	}

	var lastErr error
	for attempt := 0; attempt < max; attempt++ {
		count, err := f.FetchAndStore(ctx, job)
		if err == nil {
			return count, nil
		}
		if errors.Is(err, ErrObjectNotFound) {
			// Skip: object simply doesn't exist (empty-history symbol, etc.)
			return 0, err
		}
		lastErr = err

		// Exponential backoff.
		wait := time.Duration(math.Pow(2, float64(attempt))) * backoff
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case <-time.After(wait):
		}
	}
	return 0, fmt.Errorf("after %d attempts: %w", max, lastErr)
}

// Run is a convenience wrapper: generate jobs, filter completed, run pool.
func (f *S3Fetcher) Run(ctx context.Context, symbols []string) error {
	all := f.GenerateJobs(symbols)
	filtered, err := f.FilterCompleted(ctx, all)
	if err != nil {
		return err
	}
	return f.RunWorkerPool(ctx, filtered)
}
