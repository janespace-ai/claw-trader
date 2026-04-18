package model

import "time"

// Candlestick is a single OHLCV bar for one symbol at one interval.
// QuoteVolume is nullable because S3 CSV does not include it (the API does).
type Candlestick struct {
	Ts          time.Time
	Symbol      string
	Open        float64
	High        float64
	Low         float64
	Close       float64
	Volume      float64
	QuoteVolume *float64
}

// SupportedIntervals is the canonical interval order used throughout the service.
var SupportedIntervals = []string{"5m", "15m", "30m", "1h", "4h", "1d"}

// IntervalDuration returns the time.Duration for an interval string.
func IntervalDuration(interval string) time.Duration {
	switch interval {
	case "5m":
		return 5 * time.Minute
	case "15m":
		return 15 * time.Minute
	case "30m":
		return 30 * time.Minute
	case "1h":
		return time.Hour
	case "4h":
		return 4 * time.Hour
	case "1d":
		return 24 * time.Hour
	default:
		return 0
	}
}

// IsSupportedInterval reports whether the given interval is known.
func IsSupportedInterval(interval string) bool {
	return IntervalDuration(interval) > 0
}
