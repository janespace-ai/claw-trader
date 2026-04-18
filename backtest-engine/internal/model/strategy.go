package model

import "time"

// CodeType discriminates what the stored code is meant to do.
const (
	CodeTypeStrategy = "strategy"
	CodeTypeScreener = "screener"
)

// Strategy is a stored user-submitted strategy or screener code entry.
type Strategy struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	CodeType     string                 `json:"code_type"`
	Code         string                 `json:"code"`
	ParamsSchema map[string]any         `json:"params_schema,omitempty"`
	CreatedAt    time.Time              `json:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at"`
}
