package model

import "time"

// TradeSide is LONG or SHORT.
const (
	SideLong  = "long"
	SideShort = "short"
)

// Trade is a single round-trip in the backtest trade list.
type Trade struct {
	Symbol       string    `json:"symbol"`
	Side         string    `json:"side"`
	EntryTime    time.Time `json:"entry_time"`
	ExitTime     time.Time `json:"exit_time"`
	EntryPrice   float64   `json:"entry_price"`
	ExitPrice    float64   `json:"exit_price"`
	Size         float64   `json:"size"`
	Leverage     float64   `json:"leverage"`
	PnL          float64   `json:"pnl"`
	ReturnPct    float64   `json:"return_pct"`
	Commission   float64   `json:"commission"`
	DurationHours float64  `json:"duration_hours"`
}
