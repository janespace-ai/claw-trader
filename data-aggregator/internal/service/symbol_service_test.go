package service

import (
	"context"
	"testing"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/testdb"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/testfixtures"
)

// TestSymbolServiceRefresh wires SymbolService to the Gate.io fixture
// server and confirms it writes the expected rows into the test schema.
func TestSymbolServiceRefresh(t *testing.T) {
	st := testdb.New(t)
	_, gcfg := testfixtures.NewGateioServer(t)

	svc := NewSymbolService(gcfg, 2 /* top-N clamp smaller than 3 fixtures */, st)

	ctx := context.Background()
	syms, err := svc.Refresh(ctx)
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if len(syms) != 2 {
		t.Fatalf("expected top-2, got %d", len(syms))
	}
	if syms[0].Symbol != "BTC_USDT" {
		t.Errorf("rank 1 should be BTC_USDT, got %s", syms[0].Symbol)
	}
	if syms[1].Symbol != "ETH_USDT" {
		t.Errorf("rank 2 should be ETH_USDT, got %s", syms[1].Symbol)
	}

	// Confirm DB rows land in the test schema.
	stored, err := st.ActiveSymbols(ctx, "futures", 10)
	if err != nil {
		t.Fatalf("ActiveSymbols: %v", err)
	}
	if len(stored) != 2 {
		t.Fatalf("expected 2 active rows in DB, got %d", len(stored))
	}
}
