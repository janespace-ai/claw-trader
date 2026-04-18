package testfixtures

import (
	"compress/gzip"
	"encoding/csv"
	"io"
	"net/http"
	"strings"
	"testing"
)

// TestServerServesTickers confirms the fixture server responds to the
// tickers path with the bundled JSON.
func TestServerServesTickers(t *testing.T) {
	_, cfg := NewGateioServer(t)
	resp, err := http.Get(cfg.APIBaseURL + cfg.TickersEndpoint)
	if err != nil {
		t.Fatalf("GET tickers: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	b, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(b), "BTC_USDT") {
		t.Fatalf("response did not include BTC_USDT: %s", string(b))
	}
}

// TestServerServesS3 confirms that registered fixtures return a
// gzipped CSV and unregistered ones return 404.
func TestServerServesS3(t *testing.T) {
	fix := S3Fixture{
		Interval: "1h",
		YYYYMM:   "202512",
		Symbol:   "BTC_USDT",
		Rows: []S3Row{
			{TsUnix: 1735689600, Volume: 100, Close: 42000, High: 42100, Low: 41900, Open: 41950},
			{TsUnix: 1735693200, Volume: 120, Close: 42050, High: 42200, Low: 41950, Open: 42000},
		},
	}
	_, cfg := NewGateioServer(t, Options{S3Fixtures: []S3Fixture{fix}})

	url := cfg.S3BaseURL + "/futures_usdt/candlesticks_1h/202512/BTC_USDT-202512.csv.gz"
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET s3: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	gr, err := gzip.NewReader(resp.Body)
	if err != nil {
		t.Fatalf("gzip open: %v", err)
	}
	rows, err := csv.NewReader(gr).ReadAll()
	if err != nil {
		t.Fatalf("csv parse: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	if rows[0][0] != "1735689600" {
		t.Fatalf("unexpected first column: %q", rows[0][0])
	}

	// Missing symbol → 404.
	url404 := cfg.S3BaseURL + "/futures_usdt/candlesticks_1h/202512/XYZ_USDT-202512.csv.gz"
	r404, err := http.Get(url404)
	if err != nil {
		t.Fatalf("GET 404: %v", err)
	}
	r404.Body.Close()
	if r404.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for unregistered symbol, got %d", r404.StatusCode)
	}
}
