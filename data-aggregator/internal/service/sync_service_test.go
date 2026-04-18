package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/testdb"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/testfixtures"
)

// TestPipelineIdempotence is flagship test #1: it runs the boot
// pipeline twice and asserts that the second run does zero S3 work
// because every target month is already marked done in sync_state.
//
// The test is narrow on purpose:
//   - top_symbols = 1 (only BTC_USDT)
//   - s3_intervals = ["1h"]
//   - api_intervals = [] (skip the API phase — Gate.io API paging is
//     its own concern; we want to measure S3 re-run behaviour cleanly)
//   - months_back = 2  (so the S3 phase enumerates 2 monthly files)
//
// We pre-seed sync_state for month N-2 as "done" but leave month N-1
// as "not done". On the first run we expect S3 to enqueue 1 job. On
// the second run we expect 0.
func TestPipelineIdempotence(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	// Compute the target months the pipeline will enumerate.
	// S3Fetcher.GenerateJobs uses `now.AddDate(0, -m, 0)` for m=1..months.
	// With months_back=2, that's (now-1mo) and (now-2mo).
	now := time.Now().UTC()
	monthOneBack := now.AddDate(0, -1, 0)
	monthTwoBack := now.AddDate(0, -2, 0)
	yymm1 := fmt.Sprintf("%04d%02d", monthOneBack.Year(), int(monthOneBack.Month()))
	yymm2 := fmt.Sprintf("%04d%02d", monthTwoBack.Year(), int(monthTwoBack.Month()))

	// Seed: mark month 2 as done so only month 1 is missing.
	seedSyncState(t, st, "BTC_USDT", "1h", yymm2, model.SyncStatusDone)

	// Register S3 fixture only for the MISSING month.
	fix := testfixtures.S3Fixture{
		Interval: "1h",
		YYYYMM:   yymm1,
		Symbol:   "BTC_USDT",
		Rows:     syntheticRows(monthOneBack, 24),
	}
	_, gcfg := testfixtures.NewGateioServer(t, testfixtures.Options{
		S3Fixtures: []testfixtures.S3Fixture{fix},
	})

	cfg := config.Config{
		Gateio: gcfg,
		Sync: config.SyncConfig{
			TopSymbols:          1,
			Concurrency:         4,
			MaxRetry:            2,
			RetryBackoffSec:     1,
			S3Intervals:         []string{"1h"},
			AggregatedIntervals: nil,
			APIIntervals:        nil, // skip API phase in this test
			MonthsBack:          2,
		},
		Gap: config.GapConfig{ThresholdMultiplier: 1.5, MaxRetryPerGap: 1, SkipOnFailure: true, MaxGapAgeDays: 365},
	}
	svc := NewSyncService(cfg, st)

	// First run.
	task1 := svc.RunBootSync(ctx)
	if task1.Status != model.SyncStatusDone && task1.Status != model.SyncStatusFailed {
		t.Fatalf("unexpected first-run status: %v (error=%q)", task1.Status, task1.Error)
	}

	prog1 := svc.s3Fetcher.Progress()
	if prog1.Total != 1 {
		t.Errorf("first run: expected S3 Total=1 (only missing month), got %d (error=%q)", prog1.Total, task1.Error)
	}
	if prog1.Done != 1 {
		t.Errorf("first run: expected S3 Done=1, got %d (failed=%d)", prog1.Done, prog1.Failed)
	}

	// Capture row count between the two runs.
	var rowCountMid int
	err := st.Pool().QueryRow(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM %s.futures_1h WHERE symbol=$1`, st.Schema()), "BTC_USDT").Scan(&rowCountMid)
	if err != nil {
		t.Fatalf("count rows mid: %v", err)
	}
	if rowCountMid < 24 {
		t.Fatalf("after first run expected >=24 S3 rows, got %d", rowCountMid)
	}

	// Second run: month 1 now has sync_state=done.
	task2 := svc.RunBootSync(ctx)
	prog2 := svc.s3Fetcher.Progress()
	if prog2.Total != 0 {
		t.Errorf("second run: expected S3 Total=0 (all done), got %d (error=%q)", prog2.Total, task2.Error)
	}

	// The idempotence promise: re-running should NOT grow the data.
	// API upserts (ON CONFLICT DO NOTHING) mean even the API phase
	// touching the same bars a second time adds zero new rows.
	var rowCountAfter int
	err = st.Pool().QueryRow(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM %s.futures_1h WHERE symbol=$1`, st.Schema()), "BTC_USDT").Scan(&rowCountAfter)
	if err != nil {
		t.Fatalf("count rows after: %v", err)
	}
	if rowCountAfter != rowCountMid {
		t.Errorf("re-run grew DB rows: before=%d after=%d (expected stable)", rowCountMid, rowCountAfter)
	}
}

func seedSyncState(t *testing.T, st interface {
	UpsertSyncState(context.Context, model.SyncState) error
}, symbol, interval, period, status string) {
	t.Helper()
	err := st.UpsertSyncState(context.Background(), model.SyncState{
		Symbol: symbol, Market: "futures", Interval: interval,
		Source: "s3", Period: period,
		Status: status, RowCount: 24,
	})
	if err != nil {
		t.Fatalf("seedSyncState(%s,%s,%s): %v", symbol, interval, period, err)
	}
}

// syntheticRows produces `count` hourly bars anchored at `anchor`.
// Values are deterministic so failure messages are readable.
func syntheticRows(anchor time.Time, count int) []testfixtures.S3Row {
	rows := make([]testfixtures.S3Row, count)
	base := time.Date(anchor.Year(), anchor.Month(), 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < count; i++ {
		t := base.Add(time.Duration(i) * time.Hour)
		rows[i] = testfixtures.S3Row{
			TsUnix: t.Unix(),
			Volume: 100 + float64(i),
			Close:  61000 + float64(i),
			High:   61100 + float64(i),
			Low:    60900 + float64(i),
			Open:   60950 + float64(i),
		}
	}
	return rows
}
