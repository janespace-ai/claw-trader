package service

import (
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
)

func makeCurve(baseTs int64, equity []float64) []model.EquityPoint {
	out := make([]model.EquityPoint, len(equity))
	for i, v := range equity {
		out[i] = model.EquityPoint{
			Ts:     time.Unix(baseTs+int64(i)*3600, 0).UTC(),
			Equity: v,
		}
	}
	return out
}

func TestAggregateSummary_EmptyInput(t *testing.T) {
	if AggregateSummary(nil) != nil {
		t.Error("nil input should return nil")
	}
	if AggregateSummary(map[string]model.SymbolResult{}) != nil {
		t.Error("empty input should return nil")
	}
}

func TestAggregateSummary_SingleSymbol(t *testing.T) {
	ps := map[string]model.SymbolResult{
		"BTC_USDT": {
			EquityCurve: makeCurve(1_700_000_000, []float64{100, 110, 120}),
		},
	}
	s := AggregateSummary(ps)
	if s == nil || len(s.EquityCurve) != 3 {
		t.Fatalf("expected 3 points, got %+v", s)
	}
	// Normalized: first point should be 1.0, last should be 1.2
	if s.EquityCurve[0].Equity != 1.0 {
		t.Errorf("first point = %f, want 1.0", s.EquityCurve[0].Equity)
	}
	if s.EquityCurve[2].Equity != 1.2 {
		t.Errorf("last point = %f, want 1.2", s.EquityCurve[2].Equity)
	}
	if s.Metrics.All.TotalReturn < 0.19 || s.Metrics.All.TotalReturn > 0.21 {
		t.Errorf("total_return = %f, want ~0.2", s.Metrics.All.TotalReturn)
	}
}

func TestAggregateSummary_TwoSymbols_EqualWeight(t *testing.T) {
	ps := map[string]model.SymbolResult{
		"BTC_USDT": {EquityCurve: makeCurve(1_700_000_000, []float64{100, 120})},
		"ETH_USDT": {EquityCurve: makeCurve(1_700_000_000, []float64{100, 80})},
	}
	s := AggregateSummary(ps)
	if len(s.EquityCurve) != 2 {
		t.Fatalf("expected 2 points, got %d", len(s.EquityCurve))
	}
	// First: (1.0 + 1.0) / 2 = 1.0; last: (1.2 + 0.8) / 2 = 1.0
	if got := s.EquityCurve[1].Equity; got < 0.99 || got > 1.01 {
		t.Errorf("last point = %f, want ~1.0 (equal-weight cancellation)", got)
	}
}

func TestAggregateSummary_DrawdownIsNegative(t *testing.T) {
	ps := map[string]model.SymbolResult{
		"BTC_USDT": {EquityCurve: makeCurve(1_700_000_000, []float64{100, 110, 90, 95})},
	}
	s := AggregateSummary(ps)
	if s.Metrics.All.MaxDrawdown >= 0 {
		t.Errorf("max_drawdown should be negative, got %f", s.Metrics.All.MaxDrawdown)
	}
	if len(s.DrawdownCurve) != len(s.EquityCurve) {
		t.Errorf("drawdown curve length mismatch")
	}
}

func TestAggregateSummary_TotalTradesSumsAcrossSymbols(t *testing.T) {
	ps := map[string]model.SymbolResult{
		"BTC_USDT": {
			EquityCurve: makeCurve(1_700_000_000, []float64{100, 110}),
			Trades:      []model.Trade{{Symbol: "BTC_USDT"}, {Symbol: "BTC_USDT"}},
		},
		"ETH_USDT": {
			EquityCurve: makeCurve(1_700_000_000, []float64{100, 90}),
			Trades:      []model.Trade{{Symbol: "ETH_USDT"}},
		},
	}
	s := AggregateSummary(ps)
	if s.Metrics.All.TotalTrades != 3 {
		t.Errorf("total_trades = %d, want 3", s.Metrics.All.TotalTrades)
	}
}

func TestMonthlyReturnsFromEquity(t *testing.T) {
	eq := []model.EquityPoint{
		{Ts: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC), Equity: 1.0},
		{Ts: time.Date(2024, 1, 31, 0, 0, 0, 0, time.UTC), Equity: 1.1},
		{Ts: time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC), Equity: 1.1},
		{Ts: time.Date(2024, 2, 28, 0, 0, 0, 0, time.UTC), Equity: 0.99},
	}
	mr := monthlyReturnsFromEquity(eq)
	if len(mr) != 2 {
		t.Fatalf("expected 2 months, got %d", len(mr))
	}
	if mr[0].Month != 1 || mr[0].Return < 0.09 || mr[0].Return > 0.11 {
		t.Errorf("Jan return = %+v", mr[0])
	}
	if mr[1].Month != 2 || mr[1].Return > -0.09 {
		t.Errorf("Feb should be negative, got %+v", mr[1])
	}
}
