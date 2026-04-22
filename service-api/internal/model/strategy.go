package model

import "time"

// CodeType discriminates what the stored code is meant to do.
const (
	CodeTypeStrategy = "strategy"
	CodeTypeScreener = "screener"
)

// Strategy is a stored user-submitted strategy or screener code entry.
//
// Post-migration-003, `Code` and `ParamsSchema` are not physical columns
// on `strategies` — they're joined from `strategy_versions` for the row's
// `CurrentVersion`. The Go struct keeps them as fields so JSON responses
// look identical to callers.
type Strategy struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	CodeType       string         `json:"code_type"`
	CurrentVersion int            `json:"current_version"`
	Code           string         `json:"code"`
	ParamsSchema   map[string]any `json:"params_schema,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

// StrategyVersion is one row of the `strategy_versions` table — the
// history entry for a single code revision.
type StrategyVersion struct {
	StrategyID    string         `json:"strategy_id"`
	Version       int            `json:"version"`
	Code          string         `json:"code"`
	Summary       string         `json:"summary,omitempty"`
	ParamsSchema  map[string]any `json:"params_schema,omitempty"`
	ParentVersion *int           `json:"parent_version,omitempty"`
	CreatedAt     int64          `json:"created_at"` // Unix seconds
}
