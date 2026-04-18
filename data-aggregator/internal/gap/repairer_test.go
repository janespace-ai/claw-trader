package gap

import (
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
)

// mustParse is a test helper: panics on bad input — our fixtures are known good.
func mustParse(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t.UTC()
}

func TestRepairerShouldSkip(t *testing.T) {
	cases := []struct {
		name     string
		cfg      config.GapConfig
		gap      model.Gap
		wantSkip bool
	}{
		{
			name: "excluded_symbol matches",
			cfg: config.GapConfig{
				ExcludedSymbols: []string{"BTC_USDT"},
			},
			gap:      model.Gap{Symbol: "BTC_USDT"},
			wantSkip: true,
		},
		{
			name: "excluded_symbol no match",
			cfg: config.GapConfig{
				ExcludedSymbols: []string{"ETH_USDT"},
			},
			gap:      model.Gap{Symbol: "BTC_USDT"},
			wantSkip: false,
		},
		{
			name: "excluded_range covers gap",
			cfg: config.GapConfig{
				ExcludedRanges: []config.ExcludedRange{
					{Symbol: "*", From: "2025-08-01T03:00:00Z", To: "2025-08-01T05:00:00Z", Reason: "maintenance"},
				},
			},
			gap: model.Gap{
				Symbol:  "BTC_USDT",
				GapFrom: mustParse("2025-08-01T03:15:00Z"),
				GapTo:   mustParse("2025-08-01T04:30:00Z"),
			},
			wantSkip: true,
		},
		{
			name: "excluded_range does not cover gap",
			cfg: config.GapConfig{
				ExcludedRanges: []config.ExcludedRange{
					{Symbol: "BTC_USDT", From: "2025-08-01T03:00:00Z", To: "2025-08-01T04:00:00Z", Reason: "x"},
				},
			},
			gap: model.Gap{
				Symbol:  "BTC_USDT",
				GapFrom: mustParse("2025-08-01T06:00:00Z"),
				GapTo:   mustParse("2025-08-01T07:00:00Z"),
			},
			wantSkip: false,
		},
		{
			name: "gap older than MaxGapAgeDays",
			cfg: config.GapConfig{
				MaxGapAgeDays: 7,
			},
			gap: model.Gap{
				GapFrom: time.Now().UTC().Add(-30 * 24 * time.Hour),
			},
			wantSkip: true,
		},
		{
			name: "malformed date in excluded_ranges is ignored",
			cfg: config.GapConfig{
				ExcludedRanges: []config.ExcludedRange{
					{Symbol: "*", From: "not-a-date", To: "also-not-a-date", Reason: "busted"},
				},
			},
			gap: model.Gap{
				Symbol:  "BTC_USDT",
				GapFrom: mustParse("2025-08-01T03:15:00Z"),
				GapTo:   mustParse("2025-08-01T04:30:00Z"),
			},
			wantSkip: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := &Repairer{cfg: tc.cfg}
			got, reason := r.ShouldSkip(tc.gap)
			if got != tc.wantSkip {
				t.Fatalf("ShouldSkip=%v (reason=%q), want %v", got, reason, tc.wantSkip)
			}
		})
	}
}
