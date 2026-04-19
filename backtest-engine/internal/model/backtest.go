package model

import (
	"encoding/json"
	"time"
)

// BacktestStatus enumerates run states.
const (
	StatusPending = "pending"
	StatusRunning = "running"
	StatusDone    = "done"
	StatusFailed  = "failed"
)

// BacktestMode distinguishes single-run vs param optimization and the
// two lookback presets exposed to the frontend Workspace flow.
const (
	ModeSingle       = "single"
	ModeOptimization = "optimization"
	ModePreview      = "preview" // 7-day default lookback
	ModeDeep         = "deep"    // 180-day default lookback
)

// BacktestConfig is the user-supplied configuration for a backtest run.
//
// Multi-symbol: `Symbols` is the canonical list; a single-symbol legacy
// call is expressed as a length-1 slice. Max 50 symbols per run.
//
// Mode + lookback: `Mode == ModePreview | ModeDeep` is the primary
// driver for default lookback (7d / 180d). Explicit PreviewLookbackDays
// / DeepLookbackDays overrides are allowed but must match the mode.
type BacktestConfig struct {
	Symbols             []string `json:"symbols"`
	Interval            string   `json:"interval"`
	From                string   `json:"from"`
	To                  string   `json:"to"`
	InitialCapital      float64  `json:"initial_capital"`
	Commission          float64  `json:"commission"`
	Slippage            float64  `json:"slippage"`
	FillMode            string   `json:"fill_mode"`
	PreviewLookbackDays *int     `json:"preview_lookback_days,omitempty"`
	DeepLookbackDays    *int     `json:"deep_lookback_days,omitempty"`
}

// BacktestProgress captures progress shown to clients.
type BacktestProgress struct {
	Phase       string `json:"phase"`
	CurrentBar  int64  `json:"current_bar,omitempty"`
	TotalBars   int64  `json:"total_bars,omitempty"`
	CurrentRun  int    `json:"current_run,omitempty"`
	TotalRuns   int    `json:"total_runs,omitempty"`
	Message     string `json:"message,omitempty"`
}

// BacktestRun is the DB-level record for a backtest task.
type BacktestRun struct {
	ID          string           `json:"id"`
	StrategyID  *string          `json:"strategy_id,omitempty"`
	Status      string           `json:"status"`
	Mode        string           `json:"mode"`
	Config      json.RawMessage  `json:"config"`
	Progress    json.RawMessage  `json:"progress,omitempty"`
	Result      json.RawMessage  `json:"result,omitempty"`
	Error       string           `json:"error,omitempty"`
	StartedAt   *time.Time       `json:"started_at,omitempty"`
	FinishedAt  *time.Time       `json:"finished_at,omitempty"`
	CreatedAt   time.Time        `json:"created_at"`
}

// SymbolResult is one symbol's slice of a multi-symbol backtest result.
type SymbolResult struct {
	Metrics       MetricsSet      `json:"metrics"`
	EquityCurve   []EquityPoint   `json:"equity_curve"`
	DrawdownCurve []DrawdownPoint `json:"drawdown_curve,omitempty"`
	Trades        []Trade         `json:"trades"`
}

// SummaryBlock is the aggregated-across-symbols slice of a multi-symbol
// backtest result. Summary equity is the equal-weighted mean of each
// symbol's equity curve time-aligned to a shared grid.
type SummaryBlock struct {
	Metrics        MetricsSet      `json:"metrics"`
	EquityCurve    []EquityPoint   `json:"equity_curve"`
	DrawdownCurve  []DrawdownPoint `json:"drawdown_curve"`
	MonthlyReturns []MonthlyReturn `json:"monthly_returns"`
}

// BacktestResult is the structured payload stored under BacktestRun.Result.
//
// Single-symbol runs leave `Summary`/`PerSymbolResult` empty and fall
// back to the legacy flat fields (Metrics/EquityCurve/etc.) so existing
// consumers keep working. Multi-symbol runs populate Summary + the
// keyed `PerSymbolResult` map; the legacy flat fields are a mirror of
// `Summary` for back-compat.
type BacktestResult struct {
	Metrics             MetricsSet              `json:"metrics"`
	EquityCurve         []EquityPoint           `json:"equity_curve"`
	DrawdownCurve       []DrawdownPoint         `json:"drawdown_curve"`
	MonthlyReturns      []MonthlyReturn         `json:"monthly_returns"`
	Trades              []Trade                 `json:"trades"`
	Config              BacktestConfig          `json:"config"`
	OptimizationResults []OptimizationPoint     `json:"optimization_results,omitempty"`
	PerSymbol           map[string]MetricsSet   `json:"per_symbol,omitempty"` // legacy metrics-only
	PerSymbolResult     map[string]SymbolResult `json:"per_symbol_result,omitempty"`
	Summary             *SummaryBlock           `json:"summary,omitempty"`
}

// OptimizationPoint is one row of a parameter sweep's summary.
type OptimizationPoint struct {
	Params       map[string]any `json:"params"`
	Sharpe       float64        `json:"sharpe_ratio"`
	TotalReturn  float64        `json:"total_return"`
	MaxDrawdown  float64        `json:"max_drawdown"`
	TotalTrades  int            `json:"total_trades"`
}

// EquityPoint is one data point on the portfolio equity curve.
type EquityPoint struct {
	Ts     time.Time `json:"ts"`
	Equity float64   `json:"equity"`
}

// DrawdownPoint is one data point on the drawdown curve (percent, negative).
type DrawdownPoint struct {
	Ts       time.Time `json:"ts"`
	Drawdown float64   `json:"drawdown"`
}

// MonthlyReturn is a single cell in the monthly returns heatmap.
type MonthlyReturn struct {
	Year   int     `json:"year"`
	Month  int     `json:"month"`
	Return float64 `json:"return"`
}
