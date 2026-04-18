package handler

import (
	"context"
	"fmt"
	"testing"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/testdb"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/testhttp"
)

func TestSymbolHandler_Empty(t *testing.T) {
	st := testdb.New(t)
	h := NewSymbolHandler(st)
	resp := testhttp.Call(t, h.List, "GET", "/api/symbols", nil, nil)
	if testhttp.Status(resp) != 200 {
		t.Fatalf("expected 200, got %d", testhttp.Status(resp))
	}
	var rows []map[string]any
	testhttp.DecodeJSON(t, resp, &rows)
	if len(rows) != 0 {
		t.Errorf("empty DB expected 0 rows, got %d", len(rows))
	}
}

func TestSymbolHandler_HappyPath(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()
	table := fmt.Sprintf("%s.symbols", st.Schema())
	_, err := st.Pool().Exec(ctx,
		fmt.Sprintf(`INSERT INTO %s (symbol, market, rank, volume_24h_quote, status) VALUES ('BTC_USDT','futures',1,1e9,'active'),('ETH_USDT','futures',2,5e8,'active')`, table))
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	h := NewSymbolHandler(st)
	resp := testhttp.Call(t, h.List, "GET", "/api/symbols",
		testhttp.MustQuery("market", "futures", "limit", "5"), nil)
	if testhttp.Status(resp) != 200 {
		t.Fatalf("expected 200, got %d", testhttp.Status(resp))
	}
	var rows []map[string]any
	testhttp.DecodeJSON(t, resp, &rows)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	if rows[0]["symbol"] != "BTC_USDT" {
		t.Errorf("expected BTC_USDT first, got %v", rows[0]["symbol"])
	}
}
