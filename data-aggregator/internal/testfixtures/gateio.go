// Package testfixtures provides an httptest.Server that impersonates
// Gate.io for offline tests — serving tickers / candles / S3 monthly CSVs
// from fixtures under testdata/gateio/ plus a small in-code row table.
//
// Usage:
//
//	srv, cfg := testfixtures.NewGateioServer(t)
//	// cfg is a config.GateioConfig with all URLs rewritten to the test server.
package testfixtures

import (
	"compress/gzip"
	"embed"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
)

//go:embed testdata/gateio/*.json
var embeddedJSON embed.FS

// S3Row is one line in the Gate.io S3 CSV format:
// [timestamp, volume, close, high, low, open]  (no header, no quote_volume).
type S3Row struct {
	TsUnix int64
	Volume float64
	Close  float64
	High   float64
	Low    float64
	Open   float64
}

// S3Fixture describes one synthetic month of CSV data to serve. The
// server will respond with a gzipped CSV when the URL matches
// futures_usdt/candlesticks_<interval>/<yyyymm>/<pair>-<yyyymm>.csv.gz.
// If Rows is nil, the server returns 404 (used to test not-found paths).
type S3Fixture struct {
	Interval string
	YYYYMM   string
	Symbol   string
	Rows     []S3Row // nil → return 404
}

// Options configures the fixture server.
type Options struct {
	// S3 fixtures keyed by (interval, yyyymm, symbol) tuple.
	S3Fixtures []S3Fixture

	// If non-nil, overrides the bundled tickers JSON. Raw bytes served as-is.
	TickersJSON []byte
	// If non-nil, overrides the bundled candles JSON (served for any
	// /futures/usdt/candlesticks request).
	CandlesJSON []byte
}

// NewGateioServer starts an httptest.Server with default Opts. Caller
// may pass Options to override specific fixtures. The returned
// GateioConfig has every URL rewritten to point at the test server;
// pass it straight into NewS3Fetcher / NewAPIFetcher / NewSymbolService.
func NewGateioServer(t *testing.T, optsArg ...Options) (*httptest.Server, config.GateioConfig) {
	t.Helper()

	var opts Options
	if len(optsArg) > 0 {
		opts = optsArg[0]
	}

	if opts.TickersJSON == nil {
		b, err := embeddedJSON.ReadFile("testdata/gateio/tickers_top3.json")
		if err != nil {
			t.Fatalf("read embedded tickers: %v", err)
		}
		opts.TickersJSON = b
	}
	if opts.CandlesJSON == nil {
		b, err := embeddedJSON.ReadFile("testdata/gateio/candles_BTC_USDT_1h.json")
		if err != nil {
			t.Fatalf("read embedded candles: %v", err)
		}
		opts.CandlesJSON = b
	}

	s3Index := map[string]S3Fixture{}
	for _, f := range opts.S3Fixtures {
		key := s3Key(f.Interval, f.YYYYMM, f.Symbol)
		s3Index[key] = f
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/v4/futures/usdt/tickers", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(opts.TickersJSON)
	})
	mux.HandleFunc("/api/v4/futures/usdt/candlesticks", func(w http.ResponseWriter, r *http.Request) {
		// Always returns the configured candles JSON; per-symbol
		// variants can be added by callers passing a mux wrapper.
		w.Header().Set("Content-Type", "application/json")
		w.Write(opts.CandlesJSON)
	})
	// S3 path: /futures_usdt/candlesticks_<interval>/<yyyymm>/<pair>-<yyyymm>.csv.gz
	mux.HandleFunc("/futures_usdt/", func(w http.ResponseWriter, r *http.Request) {
		interval, yyyymm, symbol, ok := parseS3Path(r.URL.Path)
		if !ok {
			http.NotFound(w, r)
			return
		}
		fix, ok := s3Index[s3Key(interval, yyyymm, symbol)]
		if !ok || fix.Rows == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/gzip")
		gz := gzip.NewWriter(w)
		defer gz.Close()
		for _, row := range fix.Rows {
			fmt.Fprintf(gz, "%d,%.6f,%.6f,%.6f,%.6f,%.6f\n",
				row.TsUnix, row.Volume, row.Close, row.High, row.Low, row.Open)
		}
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	cfg := config.GateioConfig{
		S3BaseURL:         srv.URL,
		S3PathTemplate:    "futures_usdt/candlesticks_{interval}/{yyyymm}/{pair}-{yyyymm}.csv.gz",
		APIBaseURL:        srv.URL + "/api/v4",
		TickersEndpoint:   "/futures/usdt/tickers",
		CandlesEndpoint:   "/futures/usdt/candlesticks",
		RateLimitPerSec:   200,
		RequestTimeoutSec: 5,
	}
	return srv, cfg
}

func s3Key(interval, yyyymm, symbol string) string {
	return interval + "|" + yyyymm + "|" + symbol
}

// parseS3Path extracts (interval, yyyymm, symbol) from a request path
// like /futures_usdt/candlesticks_1h/202512/BTC_USDT-202512.csv.gz.
func parseS3Path(path string) (interval, yyyymm, symbol string, ok bool) {
	// Strip leading slash, split into segments.
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	if len(parts) != 4 || parts[0] != "futures_usdt" {
		return
	}
	if !strings.HasPrefix(parts[1], "candlesticks_") {
		return
	}
	interval = strings.TrimPrefix(parts[1], "candlesticks_")
	yyyymm = parts[2]

	// parts[3] is e.g. "BTC_USDT-202512.csv.gz"
	fileName := parts[3]
	if !strings.HasSuffix(fileName, ".csv.gz") {
		return
	}
	base := strings.TrimSuffix(fileName, ".csv.gz")
	// Split once from the right on "-<yyyymm>"
	suffix := "-" + yyyymm
	if !strings.HasSuffix(base, suffix) {
		return
	}
	symbol = strings.TrimSuffix(base, suffix)
	ok = symbol != ""
	return
}
