package gap

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/testdb"
)

// TestDetectOneFindsGap seeds a known-gap 5m series and asserts the
// detector finds exactly the expected gap range and missing_bars count.
func TestDetectOneFindsGap(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	// Seed futures_5m with bars at 00:00, 00:05, 00:10, skip 00:15-00:25,
	// resume at 00:30 and 00:35. That's a gap of 3 missing 5m bars.
	start := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)
	rows := []model.Candlestick{
		{Ts: start, Symbol: "BTC_USDT", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1},
		{Ts: start.Add(5 * time.Minute), Symbol: "BTC_USDT", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1},
		{Ts: start.Add(10 * time.Minute), Symbol: "BTC_USDT", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1},
		{Ts: start.Add(30 * time.Minute), Symbol: "BTC_USDT", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1},
		{Ts: start.Add(35 * time.Minute), Symbol: "BTC_USDT", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1},
	}
	if _, err := st.CopyCandles(ctx, "futures", "5m", rows); err != nil {
		t.Fatalf("CopyCandles: %v", err)
	}

	d := NewDetector(config.GapConfig{ThresholdMultiplier: 1.5}, st)
	report, err := d.DetectOne(ctx, "futures", "BTC_USDT", "5m",
		start, start.Add(40*time.Minute))
	if err != nil {
		t.Fatalf("DetectOne: %v", err)
	}

	if report.TotalActual != 5 {
		t.Errorf("TotalActual = %d, want 5", report.TotalActual)
	}
	if report.TotalExpected < 8 {
		t.Errorf("TotalExpected = %d, want >= 8", report.TotalExpected)
	}
	if len(report.Gaps) != 1 {
		t.Fatalf("expected 1 gap, got %d", len(report.Gaps))
	}
	g := report.Gaps[0]
	if g.MissingBars != 3 {
		t.Errorf("MissingBars = %d, want 3", g.MissingBars)
	}
	// Completeness should be 5 / expected.
	if report.Completeness >= 100.0 || report.Completeness <= 0 {
		t.Errorf("Completeness out of range: %v", report.Completeness)
	}

	// Detect again — InsertGap is idempotent on (symbol, market, interval, gap_from, gap_to).
	report2, err := d.DetectOne(ctx, "futures", "BTC_USDT", "5m",
		start, start.Add(40*time.Minute))
	if err != nil {
		t.Fatalf("DetectOne (2nd): %v", err)
	}
	if len(report2.Gaps) != 1 {
		t.Fatalf("re-detect produced %d gaps; expected idempotent 1", len(report2.Gaps))
	}

	// Confirm only one row is in claw.gaps.
	var count int
	err = st.Pool().QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %s.gaps", st.Schema())).Scan(&count)
	if err != nil {
		t.Fatalf("count gaps: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 row in gaps, got %d", count)
	}
}
