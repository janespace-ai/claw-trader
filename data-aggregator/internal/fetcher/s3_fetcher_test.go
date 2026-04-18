package fetcher

import (
	"strings"
	"testing"
)

func TestParseGateS3CSV(t *testing.T) {
	// Gate.io S3 CSV column order: [timestamp, volume, close, high, low, open]
	cases := []struct {
		name      string
		input     string
		wantRows  int
		wantErr   bool
		firstOpen float64
	}{
		{
			name:      "happy path 2 rows",
			input:     "1735689600,100.5,42000.0,42100.5,41900.2,41950.0\n1735693200,120.3,42050.0,42200.0,41950.0,42000.0\n",
			wantRows:  2,
			firstOpen: 41950.0,
		},
		{
			name:     "trailing blank line tolerated",
			input:    "1735689600,100.5,42000.0,42100.5,41900.2,41950.0\n\n",
			wantRows: 1,
		},
		{
			name:     "short record dropped silently",
			input:    "1735689600,100.5,42000.0\n1735693200,120.3,42050.0,42200.0,41950.0,42000.0\n",
			wantRows: 1,
		},
		{
			name:    "bad numeric field errors",
			input:   "1735689600,oops,42000.0,42100.5,41900.2,41950.0\n",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rows, err := parseGateS3CSV(strings.NewReader(tc.input), "BTC_USDT")
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(rows) != tc.wantRows {
				t.Fatalf("expected %d rows, got %d", tc.wantRows, len(rows))
			}
			if tc.firstOpen != 0 && rows[0].Open != tc.firstOpen {
				t.Fatalf("expected first Open %v, got %v", tc.firstOpen, rows[0].Open)
			}
			if tc.wantRows > 0 && rows[0].Symbol != "BTC_USDT" {
				t.Fatalf("symbol not set: %q", rows[0].Symbol)
			}
		})
	}
}
