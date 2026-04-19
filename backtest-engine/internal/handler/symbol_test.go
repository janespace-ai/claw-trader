package handler

import (
	"context"
	"fmt"
	"testing"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/testdb"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/testhttp"
)

// paginatedResponse decodes the canonical `{items, next_cursor}` wrapper.
type paginatedResponse struct {
	Items      []map[string]any `json:"items"`
	NextCursor *string          `json:"next_cursor"`
}

func TestSymbolHandler_Empty(t *testing.T) {
	st := testdb.New(t)
	h := NewSymbolHandler(st)
	resp := testhttp.Call(t, h.List, "GET", "/api/symbols", nil, nil)
	if testhttp.Status(resp) != 200 {
		t.Fatalf("expected 200, got %d", testhttp.Status(resp))
	}
	var body paginatedResponse
	testhttp.DecodeJSON(t, resp, &body)
	if len(body.Items) != 0 {
		t.Errorf("empty DB expected 0 rows, got %d", len(body.Items))
	}
	if body.NextCursor != nil {
		t.Errorf("expected nil next_cursor, got %q", *body.NextCursor)
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
	var body paginatedResponse
	testhttp.DecodeJSON(t, resp, &body)
	if len(body.Items) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(body.Items))
	}
	if body.Items[0]["symbol"] != "BTC_USDT" {
		t.Errorf("expected BTC_USDT first, got %v", body.Items[0]["symbol"])
	}
}
