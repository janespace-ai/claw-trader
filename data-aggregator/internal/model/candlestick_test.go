package model

import (
	"testing"
	"time"
)

func TestIntervalDuration(t *testing.T) {
	cases := map[string]time.Duration{
		"5m":  5 * time.Minute,
		"15m": 15 * time.Minute,
		"30m": 30 * time.Minute,
		"1h":  time.Hour,
		"4h":  4 * time.Hour,
		"1d":  24 * time.Hour,
	}
	for in, want := range cases {
		if got := IntervalDuration(in); got != want {
			t.Errorf("IntervalDuration(%q) = %v, want %v", in, got, want)
		}
	}
	if got := IntervalDuration("unknown"); got != 0 {
		t.Errorf("expected 0 for unknown interval, got %v", got)
	}
	if got := IntervalDuration(""); got != 0 {
		t.Errorf("expected 0 for empty interval, got %v", got)
	}
}

func TestIsSupportedInterval(t *testing.T) {
	for _, iv := range SupportedIntervals {
		if !IsSupportedInterval(iv) {
			t.Errorf("%q should be supported", iv)
		}
	}
	if IsSupportedInterval("13m") {
		t.Error("13m should not be supported")
	}
}
