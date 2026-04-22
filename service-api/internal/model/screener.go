package model

import (
	"encoding/json"
	"time"
)

// ScreenerConfig is the user-supplied configuration for a screener run.
// Enforced: only 1h / 4h / 1d K-line data plus symbol metadata.
type ScreenerConfig struct {
	Market        string `json:"market"`         // default "futures"
	LookbackDays  int    `json:"lookback_days"`  // default 365
	// IntervalsAllowed is hard-coded server-side to ['1h','4h','1d']; ignored from client input.
}

// ScreenerRun is the DB record for a screener task.
type ScreenerRun struct {
	ID         string           `json:"id"`
	StrategyID *string          `json:"strategy_id,omitempty"`
	Status     string           `json:"status"`
	Config     json.RawMessage  `json:"config"`
	Result     json.RawMessage  `json:"result,omitempty"`
	Error      string           `json:"error,omitempty"`
	StartedAt  *time.Time       `json:"started_at,omitempty"`
	FinishedAt *time.Time       `json:"finished_at,omitempty"`
	CreatedAt  time.Time        `json:"created_at"`
}

// ScreenerResult is the structured payload stored under ScreenerRun.Result.
type ScreenerResult struct {
	TotalSymbols int                 `json:"total_symbols"`
	Passed       int                 `json:"passed"`
	Results      []ScreenerRowResult `json:"results"`
}

// ScreenerRowResult is the per-symbol verdict.
type ScreenerRowResult struct {
	Symbol string  `json:"symbol"`
	Passed bool    `json:"passed"`
	Score  float64 `json:"score"`
	Rank   *int    `json:"rank,omitempty"`
	Error  string  `json:"error,omitempty"`
}
