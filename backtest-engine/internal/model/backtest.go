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

// BacktestMode distinguishes single-run vs param optimization.
const (
	ModeSingle       = "single"
	ModeOptimization = "optimization"
)

// BacktestConfig is the user-supplied configuration for a backtest run.
type BacktestConfig struct {
	Symbols        []string `json:"symbols"`
	Interval       string   `json:"interval"`
	From           string   `json:"from"`
	To             string   `json:"to"`
	InitialCapital float64  `json:"initial_capital"`
	Commission     float64  `json:"commission"`
	Slippage       float64  `json:"slippage"`
	FillMode       string   `json:"fill_mode"`
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

// BacktestResult is the structured payload stored under BacktestRun.Result.
type BacktestResult struct {
	Metrics             MetricsSet          `json:"metrics"`
	EquityCurve         []EquityPoint       `json:"equity_curve"`
	DrawdownCurve       []DrawdownPoint     `json:"drawdown_curve"`
	MonthlyReturns      []MonthlyReturn     `json:"monthly_returns"`
	Trades              []Trade             `json:"trades"`
	Config              BacktestConfig      `json:"config"`
	OptimizationResults []OptimizationPoint `json:"optimization_results,omitempty"`
	PerSymbol           map[string]MetricsSet `json:"per_symbol,omitempty"`
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
