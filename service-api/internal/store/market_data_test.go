package store_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/service-api/internal/store"
	"github.com/janespace-ai/claw-trader/service-api/internal/testdb"
)

func TestIsSupportedInterval(t *testing.T) {
	for _, iv := range store.SupportedIntervals {
		if !store.IsSupportedInterval(iv) {
			t.Errorf("%q should be supported", iv)
		}
	}
	for _, iv := range []string{"", "13m", "2h", "1w"} {
		if store.IsSupportedInterval(iv) {
			t.Errorf("%q should NOT be supported", iv)
		}
	}
}

// TestQueryKlines seeds rows into a futures hypertable in the test schema
// via raw SQL and asserts QueryKlines returns them in ascending time order.
func TestQueryKlines(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	start := time.Date(2025, 6, 1, 12, 0, 0, 0, time.UTC)
	table := fmt.Sprintf("%s.futures_1h", st.Schema())
	for i := 0; i < 3; i++ {
		ts := start.Add(time.Duration(i) * time.Hour)
		_, err := st.Pool().Exec(ctx,
			fmt.Sprintf(`INSERT INTO %s (ts, symbol, open, high, low, close, volume) VALUES ($1,$2,$3,$4,$5,$6,$7)`, table),
			ts, "BTC_USDT", 100.0+float64(i), 110.0, 95.0, 105.0+float64(i), 1234.0,
		)
		if err != nil {
			t.Fatalf("seed row %d: %v", i, err)
		}
	}

	rows, err := st.QueryKlines(ctx, "futures", "1h", "BTC_USDT", start, start.Add(3*time.Hour))
	if err != nil {
		t.Fatalf("QueryKlines: %v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(rows))
	}
	if rows[0].Ts != start.Unix() {
		t.Errorf("first row ts=%d, want %d", rows[0].Ts, start.Unix())
	}
	if rows[2].C != 107.0 {
		t.Errorf("third row close=%v, want 107", rows[2].C)
	}

	// Unsupported interval returns error.
	if _, err := st.QueryKlines(ctx, "futures", "9m", "BTC_USDT", start, start.Add(time.Hour)); err == nil {
		t.Error("expected error for unsupported interval")
	}
}

func TestListActiveSymbols(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	table := fmt.Sprintf("%s.symbols", st.Schema())
	pairs := []struct {
		sym  string
		rank int
	}{
		{"BTC_USDT", 1},
		{"ETH_USDT", 2},
		{"SOL_USDT", 3},
	}
	for _, p := range pairs {
		_, err := st.Pool().Exec(ctx,
			fmt.Sprintf(`INSERT INTO %s (symbol, market, rank, volume_24h_quote, status) VALUES ($1,'futures',$2,$3,'active')`, table),
			p.sym, p.rank, float64(p.rank)*1e8,
		)
		if err != nil {
			t.Fatalf("seed %s: %v", p.sym, err)
		}
	}

	got, err := st.ListActiveSymbols(ctx, "futures", 10)
	if err != nil {
		t.Fatalf("ListActiveSymbols: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3, got %d", len(got))
	}
	if got[0].Symbol != "BTC_USDT" {
		t.Errorf("order wrong: first=%s", got[0].Symbol)
	}
}

func TestQueryGaps(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	table := fmt.Sprintf("%s.gaps", st.Schema())
	_, err := st.Pool().Exec(ctx,
		fmt.Sprintf(`INSERT INTO %s (symbol, market, interval, gap_from, gap_to, missing_bars, status) VALUES ($1,'futures','5m', now() - interval '2 hours', now() - interval '1 hour', 12, 'detected')`, table),
		"BTC_USDT",
	)
	if err != nil {
		t.Fatalf("seed gap: %v", err)
	}

	got, err := st.QueryGaps(ctx, store.GapFilter{Symbol: "BTC_USDT"})
	if err != nil {
		t.Fatalf("QueryGaps: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1, got %d", len(got))
	}
	if got[0].MissingBars != 12 {
		t.Errorf("missing_bars=%d, want 12", got[0].MissingBars)
	}

	none, err := st.QueryGaps(ctx, store.GapFilter{Symbol: "ETH_USDT"})
	if err != nil {
		t.Fatalf("QueryGaps (none): %v", err)
	}
	if len(none) != 0 {
		t.Errorf("expected 0 for ETH_USDT, got %d", len(none))
	}
}
