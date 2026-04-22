package service

import (
	"math"
	"sort"
	"time"

	"github.com/janespace-ai/claw-trader/service-api/internal/model"
)

// AggregateSummary builds a SummaryBlock from per-symbol results by
// time-aligning each symbol's equity curve to a shared grid and taking
// the equal-weighted mean.
//
// Behavior:
//   - Each symbol's equity is normalized so its first value is 1.0.
//     This keeps the summary equity free of dollar-weighting when
//     symbols have wildly different starting values.
//   - The shared time grid is the sorted union of all per-symbol ts.
//   - For each grid point, the summary equity is the mean of each
//     symbol's equity at-or-before that point (forward-fill missing).
//   - Drawdown is computed from the summary equity (running-max).
//   - MonthlyReturns are month-over-month deltas of summary equity.
//   - Summary metrics include total_return, sharpe (simple), max_dd,
//     and total_trades (sum across symbols).
func AggregateSummary(perSymbol map[string]model.SymbolResult) *model.SummaryBlock {
	if len(perSymbol) == 0 {
		return nil
	}
	// Collect sorted union of timestamps.
	tsSet := map[int64]struct{}{}
	for _, s := range perSymbol {
		for _, p := range s.EquityCurve {
			tsSet[p.Ts.Unix()] = struct{}{}
		}
	}
	if len(tsSet) == 0 {
		return &model.SummaryBlock{}
	}
	tsList := make([]int64, 0, len(tsSet))
	for t := range tsSet {
		tsList = append(tsList, t)
	}
	sort.Slice(tsList, func(i, j int) bool { return tsList[i] < tsList[j] })

	// For each symbol, precompute a normalized-to-1.0 curve then an
	// iterator that forward-fills through the shared grid.
	type normCurve struct {
		ts  []int64
		val []float64
	}
	norms := make([]normCurve, 0, len(perSymbol))
	totalTrades := 0
	for _, s := range perSymbol {
		if len(s.EquityCurve) == 0 {
			continue
		}
		base := s.EquityCurve[0].Equity
		if base == 0 {
			base = 1
		}
		nc := normCurve{
			ts:  make([]int64, len(s.EquityCurve)),
			val: make([]float64, len(s.EquityCurve)),
		}
		for i, p := range s.EquityCurve {
			nc.ts[i] = p.Ts.Unix()
			nc.val[i] = p.Equity / base
		}
		norms = append(norms, nc)
		totalTrades += len(s.Trades)
	}
	if len(norms) == 0 {
		return &model.SummaryBlock{}
	}

	// Walk the shared grid; for each ts collect the forward-filled
	// value from each symbol and average them.
	idx := make([]int, len(norms)) // per-symbol cursor
	equity := make([]model.EquityPoint, 0, len(tsList))
	for _, ts := range tsList {
		sum := 0.0
		n := 0
		for i, nc := range norms {
			// Advance cursor to the last <= ts.
			for idx[i]+1 < len(nc.ts) && nc.ts[idx[i]+1] <= ts {
				idx[i]++
			}
			// If this symbol hasn't started yet, skip it.
			if nc.ts[idx[i]] > ts {
				continue
			}
			sum += nc.val[idx[i]]
			n++
		}
		if n == 0 {
			continue
		}
		equity = append(equity, model.EquityPoint{
			Ts:     time.Unix(ts, 0).UTC(),
			Equity: sum / float64(n),
		})
	}

	// Drawdown: running max minus current, normalized.
	drawdown := make([]model.DrawdownPoint, len(equity))
	runMax := 0.0
	maxDD := 0.0
	for i, p := range equity {
		if p.Equity > runMax {
			runMax = p.Equity
		}
		dd := 0.0
		if runMax > 0 {
			dd = (p.Equity - runMax) / runMax // <= 0
		}
		if dd < maxDD {
			maxDD = dd
		}
		drawdown[i] = model.DrawdownPoint{Ts: p.Ts, Drawdown: dd}
	}

	// Metrics.
	totalReturn := 0.0
	if len(equity) > 0 {
		totalReturn = equity[len(equity)-1].Equity - 1
	}
	metrics := model.MetricsSet{
		All: model.Metrics{
			TotalReturn: totalReturn,
			MaxDrawdown: maxDD,
			SharpeRatio: approxSharpe(equity),
			TotalTrades: totalTrades,
		},
	}

	// Monthly returns.
	monthly := monthlyReturnsFromEquity(equity)

	return &model.SummaryBlock{
		Metrics:        metrics,
		EquityCurve:    equity,
		DrawdownCurve:  drawdown,
		MonthlyReturns: monthly,
	}
}

// approxSharpe returns a rough Sharpe estimate from the equity curve.
// Uses daily returns (if any pair of points is >= 12h apart) or per-
// sample returns otherwise. Zero when variance is zero.
func approxSharpe(eq []model.EquityPoint) float64 {
	if len(eq) < 2 {
		return 0
	}
	rets := make([]float64, 0, len(eq)-1)
	for i := 1; i < len(eq); i++ {
		prev := eq[i-1].Equity
		if prev <= 0 {
			continue
		}
		rets = append(rets, (eq[i].Equity-prev)/prev)
	}
	if len(rets) == 0 {
		return 0
	}
	mean := 0.0
	for _, r := range rets {
		mean += r
	}
	mean /= float64(len(rets))
	varSum := 0.0
	for _, r := range rets {
		varSum += (r - mean) * (r - mean)
	}
	if varSum == 0 {
		return 0
	}
	std := math.Sqrt(varSum / float64(len(rets)))
	// Annualize: assume 24*365 hourly samples as a coarse default.
	// Real Sharpe computation lives in Python framework; this is a
	// fallback for aggregation-only calls.
	return (mean / std) * math.Sqrt(365)
}

// monthlyReturnsFromEquity computes (end/start - 1) for each distinct
// calendar month present in the curve.
func monthlyReturnsFromEquity(eq []model.EquityPoint) []model.MonthlyReturn {
	if len(eq) == 0 {
		return nil
	}
	type key struct{ year, month int }
	first := map[key]float64{}
	last := map[key]float64{}
	order := []key{}
	for _, p := range eq {
		k := key{year: p.Ts.Year(), month: int(p.Ts.Month())}
		if _, ok := first[k]; !ok {
			first[k] = p.Equity
			order = append(order, k)
		}
		last[k] = p.Equity
	}
	out := make([]model.MonthlyReturn, 0, len(order))
	for _, k := range order {
		base := first[k]
		if base == 0 {
			continue
		}
		out = append(out, model.MonthlyReturn{
			Year:   k.year,
			Month:  k.month,
			Return: (last[k] - base) / base,
		})
	}
	return out
}
