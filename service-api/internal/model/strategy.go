package model

import "time"

// CodeType discriminates what the stored code is meant to do.
const (
	CodeTypeStrategy = "strategy"
	CodeTypeScreener = "screener"
)

// Strategy is a stored user-submitted strategy.  Post unified-strategy-
// workspace (migration 006), it is the unit of work — one strategy row
// = one chat session = one set of (code, symbols).
//
// Field zones:
//   - identity:   ID / Name / CodeType (legacy) / CurrentVersion / timestamps
//   - workspace:  DraftCode, DraftSymbols — mutate continuously from chat,
//                 and LastBacktest cache
//   - saved:      SavedCode, SavedSymbols, SavedAt — snapshot taken only
//                 when the user explicitly clicks "保存策略"
//   - lifecycle:  IsArchivedDraft — flips true when the user pressed
//                 "+ 新建策略" while the session was dirty
//
// The legacy `Code` / `ParamsSchema` fields remain on the JSON envelope
// for one release cycle so old clients keep working — they read from
// SavedCode (or DraftCode if SavedCode is null) on serialization.
type Strategy struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	CodeType       string         `json:"code_type,omitempty"`
	CurrentVersion int            `json:"current_version"`
	Code           string         `json:"code"`
	ParamsSchema   map[string]any `json:"params_schema,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`

	// ---- workspace zone (migration 006) ----
	DraftCode    *string  `json:"draft_code,omitempty"`
	DraftSymbols []string `json:"draft_symbols,omitempty"`

	// ---- saved zone (migration 006) ----
	SavedCode    *string    `json:"saved_code,omitempty"`
	SavedSymbols []string   `json:"saved_symbols,omitempty"`
	SavedAt      *time.Time `json:"saved_at,omitempty"`

	// ---- cache + lifecycle (migration 006) ----
	LastBacktest    *LastBacktestSummary `json:"last_backtest,omitempty"`
	IsArchivedDraft bool                 `json:"is_archived_draft"`
}

// LastBacktestSummary is the cached backtest summary stored on the strategy
// so re-opening it shows the result without re-running.  Persisted as JSONB.
type LastBacktestSummary struct {
	TaskID  string         `json:"task_id"`
	Summary map[string]any `json:"summary"`
	RanAt   int64          `json:"ran_at"` // unix seconds
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
