package model

import "time"

// Symbol represents a single tradable pair tracked by the data aggregator.
type Symbol struct {
	Symbol          string
	Market          string  // "futures" (currently only supported)
	Rank            *int    // nullable: nil once dropped out of top N
	Volume24hQuote  float64 // USDT volume over last 24h
	Status          string  // "active" | "inactive"
	LeverageMax     int     // max leverage as reported by Gate.io
	UpdatedAt       time.Time
}
