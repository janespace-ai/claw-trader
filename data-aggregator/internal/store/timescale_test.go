package store_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/testdb"
)

// TestCopyCandlesIdempotent calls CopyCandles twice with the same rows
// and confirms the table ends up with exactly one row per unique
// (symbol, ts) — the ON CONFLICT DO NOTHING contract.
func TestCopyCandlesIdempotent(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	start := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)
	rows := []model.Candlestick{
		{Ts: start, Symbol: "BTC_USDT", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1},
		{Ts: start.Add(5 * time.Minute), Symbol: "BTC_USDT", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1},
		{Ts: start.Add(10 * time.Minute), Symbol: "BTC_USDT", Open: 1, High: 1, Low: 1, Close: 1, Volume: 1},
	}

	if _, err := st.CopyCandles(ctx, "futures", "5m", rows); err != nil {
		t.Fatalf("first copy: %v", err)
	}
	if _, err := st.CopyCandles(ctx, "futures", "5m", rows); err != nil {
		t.Fatalf("second copy: %v", err)
	}

	var count int
	err := st.Pool().QueryRow(ctx, fmt.Sprintf(`SELECT COUNT(*) FROM %s.futures_5m WHERE symbol=$1`, st.Schema()), "BTC_USDT").Scan(&count)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected 3 rows after idempotent double-insert, got %d", count)
	}
}
