package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/handler"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/testdb"
)

// TestGatewayWiring starts a real Hertz server on a random port and
// exercises the market-data gateway routes (`/healthz`, `/api/symbols`,
// `/api/klines`) end-to-end. It uses testdb so the Store is real; the
// heavier BacktestService / ScreenerService wiring is not under test
// here (those routes are exercised by service-level integration work).
//
// The purpose is to catch "route was never registered" / "handler
// signature drift" regressions that handler-unit tests cannot see.
func TestGatewayWiring(t *testing.T) {
	st := testdb.New(t)

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := lis.Addr().String()
	lis.Close()

	h := server.New(
		server.WithHostPorts(addr),
		server.WithReadTimeout(5*time.Second),
		server.WithWriteTimeout(5*time.Second),
	)
	h.GET("/healthz", func(_ context.Context, c *app.RequestContext) {
		c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
	klH := handler.NewKlineHandler(st)
	symH := handler.NewSymbolHandler(st)
	gapH := handler.NewGapHandler(st)
	api := h.Group("/api")
	api.GET("/klines", klH.Query)
	api.GET("/symbols", symH.List)
	api.GET("/gaps", gapH.List)

	go h.Spin()
	t.Cleanup(func() { time.Sleep(50 * time.Millisecond) })

	// Wait for listen.
	var alive bool
	for i := 0; i < 50; i++ {
		time.Sleep(20 * time.Millisecond)
		r, err := http.Get(fmt.Sprintf("http://%s/healthz", addr))
		if err == nil && r.StatusCode == http.StatusOK {
			r.Body.Close()
			alive = true
			break
		}
	}
	if !alive {
		t.Fatalf("server never became reachable at %s", addr)
	}

	// Happy path: /api/symbols with empty DB returns [] (200 OK).
	r2, err := http.Get(fmt.Sprintf("http://%s/api/symbols?limit=5", addr))
	if err != nil {
		t.Fatalf("GET symbols: %v", err)
	}
	defer r2.Body.Close()
	if r2.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from /api/symbols, got %d", r2.StatusCode)
	}
	var syms []any
	if err := json.NewDecoder(r2.Body).Decode(&syms); err != nil {
		t.Fatalf("decode symbols: %v", err)
	}

	// Input validation: /api/klines without symbol → 400.
	r3, err := http.Get(fmt.Sprintf("http://%s/api/klines?interval=1h", addr))
	if err != nil {
		t.Fatalf("GET klines (bad): %v", err)
	}
	defer r3.Body.Close()
	if r3.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing symbol, got %d", r3.StatusCode)
	}
}
