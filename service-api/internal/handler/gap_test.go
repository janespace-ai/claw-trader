package handler

import (
	"context"
	"fmt"
	"testing"

	"github.com/janespace-ai/claw-trader/service-api/internal/testdb"
	"github.com/janespace-ai/claw-trader/service-api/internal/testhttp"
)

func TestGapHandler_Empty(t *testing.T) {
	st := testdb.New(t)
	h := NewGapHandler(st)
	resp := testhttp.Call(t, h.List, "GET", "/api/gaps", nil, nil)
	if testhttp.Status(resp) != 200 {
		t.Fatalf("expected 200, got %d", testhttp.Status(resp))
	}
	var rows []map[string]any
	testhttp.DecodeJSON(t, resp, &rows)
	if len(rows) != 0 {
		t.Errorf("expected empty, got %d", len(rows))
	}
}

func TestGapHandler_HappyPath(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()
	table := fmt.Sprintf("%s.gaps", st.Schema())
	_, err := st.Pool().Exec(ctx,
		fmt.Sprintf(`INSERT INTO %s (symbol, market, interval, gap_from, gap_to, missing_bars, status) VALUES ('BTC_USDT','futures','5m', now() - interval '2 hours', now() - interval '1 hour', 12, 'detected')`, table))
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	h := NewGapHandler(st)
	resp := testhttp.Call(t, h.List, "GET", "/api/gaps",
		testhttp.MustQuery("symbol", "BTC_USDT"), nil)
	if testhttp.Status(resp) != 200 {
		t.Fatalf("expected 200, got %d", testhttp.Status(resp))
	}
	var rows []map[string]any
	testhttp.DecodeJSON(t, resp, &rows)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0]["missing_bars"].(float64) != 12 {
		t.Errorf("missing_bars=%v, want 12", rows[0]["missing_bars"])
	}
}
