package handler

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/service-api/internal/testdb"
	"github.com/janespace-ai/claw-trader/service-api/internal/testhttp"
)

func TestKlineHandler_MissingSymbol(t *testing.T) {
	st := testdb.New(t)
	h := NewKlineHandler(st)
	resp := testhttp.Call(t, h.Query, "GET", "/api/klines", testhttp.MustQuery("interval", "1h"), nil)
	if testhttp.Status(resp) != 400 {
		t.Fatalf("expected 400, got %d (body=%s)", testhttp.Status(resp), testhttp.Body(resp))
	}
}

func TestKlineHandler_BadInterval(t *testing.T) {
	st := testdb.New(t)
	h := NewKlineHandler(st)
	resp := testhttp.Call(t, h.Query, "GET", "/api/klines",
		testhttp.MustQuery("symbol", "BTC_USDT", "interval", "13m"), nil)

	if testhttp.Status(resp) != 400 {
		t.Fatalf("expected 400, got %d", testhttp.Status(resp))
	}
	var body struct {
		Error struct {
			Code    string         `json:"code"`
			Details map[string]any `json:"details"`
		} `json:"error"`
	}
	testhttp.DecodeJSON(t, resp, &body)
	if body.Error.Code != "INVALID_INTERVAL" {
		t.Errorf("expected code INVALID_INTERVAL, got %q", body.Error.Code)
	}
	if _, ok := body.Error.Details["allowed_intervals"]; !ok {
		t.Errorf("expected allowed_intervals in error details; got %v", body.Error.Details)
	}
}

func TestKlineHandler_HappyPath(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	// Seed 5 bars.
	start := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)
	table := fmt.Sprintf("%s.futures_1h", st.Schema())
	for i := 0; i < 5; i++ {
		_, err := st.Pool().Exec(ctx,
			fmt.Sprintf(`INSERT INTO %s (ts, symbol, open, high, low, close, volume) VALUES ($1,$2,$3,$4,$5,$6,$7)`, table),
			start.Add(time.Duration(i)*time.Hour), "BTC_USDT", 100.0, 110.0, 95.0, float64(100+i), 1000.0,
		)
		if err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	h := NewKlineHandler(st)
	resp := testhttp.Call(t, h.Query, "GET", "/api/klines",
		testhttp.MustQuery(
			"symbol", "BTC_USDT",
			"interval", "1h",
			"from", fmt.Sprint(start.Unix()),
			"to", fmt.Sprint(start.Add(5*time.Hour).Unix()),
		), nil)
	if testhttp.Status(resp) != 200 {
		t.Fatalf("expected 200, got %d (%s)", testhttp.Status(resp), testhttp.Body(resp))
	}
	var rows []map[string]any
	testhttp.DecodeJSON(t, resp, &rows)
	if len(rows) != 5 {
		t.Fatalf("expected 5 rows, got %d", len(rows))
	}
	// limit=2 trims to last 2.
	respLim := testhttp.Call(t, h.Query, "GET", "/api/klines",
		testhttp.MustQuery(
			"symbol", "BTC_USDT",
			"interval", "1h",
			"from", fmt.Sprint(start.Unix()),
			"to", fmt.Sprint(start.Add(5*time.Hour).Unix()),
			"limit", "2",
		), nil)
	var limited []map[string]any
	testhttp.DecodeJSON(t, respLim, &limited)
	if len(limited) != 2 {
		t.Errorf("limit=2 expected 2 rows, got %d", len(limited))
	}
}

// silence `use context`
var _ = context.Background
