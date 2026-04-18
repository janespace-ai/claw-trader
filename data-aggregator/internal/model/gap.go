package model

import "time"

// GapStatus enumerates gap lifecycle states.
const (
	GapStatusDetected      = "detected"
	GapStatusRepairing     = "repairing"
	GapStatusDone          = "done"
	GapStatusUnrecoverable = "unrecoverable"
	GapStatusSkipped       = "skipped"
)

// Gap represents a single detected missing range in a (symbol, interval) series.
type Gap struct {
	ID          int64
	Symbol      string
	Market      string
	Interval    string
	GapFrom     time.Time
	GapTo       time.Time
	MissingBars int
	Status      string
	RetryCount  int
	LastError   string
	DetectedAt  time.Time
	UpdatedAt   time.Time
}

// GapReport is an aggregated completeness + gap listing for one (symbol, interval).
type GapReport struct {
	Symbol         string    `json:"symbol"`
	Market         string    `json:"market"`
	Interval       string    `json:"interval"`
	From           time.Time `json:"from"`
	To             time.Time `json:"to"`
	TotalExpected  int64     `json:"total_expected"`
	TotalActual    int64     `json:"total_actual"`
	Completeness   float64   `json:"completeness"`  // 0-100 percent
	Gaps           []Gap     `json:"gaps"`
}
