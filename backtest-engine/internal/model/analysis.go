package model

import (
	"encoding/json"
	"time"
)

// AnalysisType enumerates the three analysis kinds. Discriminates rows
// in the `analysis_runs` table.
const (
	AnalysisTypeOptimLens = "optimlens"
	AnalysisTypeSignals   = "signals"
	AnalysisTypeTrade     = "trade"
)

// AnalysisRun is the DB-level record for one analysis task.
type AnalysisRun struct {
	ID         string           `json:"id"`
	Type       string           `json:"type"`
	Config     json.RawMessage  `json:"config"`
	Status     string           `json:"status"`
	Progress   json.RawMessage  `json:"progress,omitempty"`
	Result     json.RawMessage  `json:"result,omitempty"`
	Error      json.RawMessage  `json:"error,omitempty"`
	StartedAt  *time.Time       `json:"started_at,omitempty"`
	FinishedAt *time.Time       `json:"finished_at,omitempty"`
	CreatedAt  time.Time        `json:"created_at"`
}

// OptimLensRequest mirrors the openapi schema.
type OptimLensRequest struct {
	StrategyID   string                   `json:"strategy_id"`
	Symbols      []string                 `json:"symbols"`
	LookbackDays int                      `json:"lookback_days,omitempty"`
	ParamGrid    map[string][]interface{} `json:"param_grid"`
}

// SignalReviewRequest mirrors the openapi schema.
type SignalReviewRequest struct {
	BacktestTaskID string `json:"backtest_task_id"`
}

// TradeExplainRequest is a discriminated union in the openapi schema;
// we accept either form here and let the handler narrow.
type TradeExplainRequest struct {
	BacktestTaskID string `json:"backtest_task_id,omitempty"`
	Symbol         string `json:"symbol,omitempty"`
	TradeID        string `json:"trade_id,omitempty"`
	// Alternate form carries embedded trade + klines_context.
	Trade          *Trade  `json:"trade,omitempty"`
	KlinesContext  []Kline `json:"klines_context,omitempty"`
}

// Kline is imported here for TradeExplainRequest's inline payload
// shape. Full kline rows live in market_data domain types already.
type Kline struct {
	Ts     time.Time `json:"ts"`
	Open   float64   `json:"open"`
	High   float64   `json:"high"`
	Low    float64   `json:"low"`
	Close  float64   `json:"close"`
	Volume float64   `json:"volume"`
}
