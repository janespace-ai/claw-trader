package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/cloudwego/hertz/pkg/app/server"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/router"
)

// TestHealthzWiring boots the real Hertz instance (with only the
// headless /healthz route registered) on a random localhost port and
// verifies the endpoint responds 200 JSON. This proves the router
// registration is intact — deliberately separate from the handler
// unit tests which call handlers directly.
func TestHealthzWiring(t *testing.T) {
	// Pick a free port via net.Listen.
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := lis.Addr().String()
	lis.Close() // Hertz will bind its own

	h := server.New(
		server.WithHostPorts(addr),
		server.WithReadTimeout(5*time.Second),
		server.WithWriteTimeout(5*time.Second),
	)
	router.Register(h)

	go h.Spin()
	t.Cleanup(func() {
		// Hertz has no public Stop on older versions; rely on process
		// exit when the test binary finishes. We do a short sleep to
		// avoid racing the go h.Spin() above when the test function
		// returns immediately.
		time.Sleep(50 * time.Millisecond)
	})

	// Poll /healthz; Hertz takes a handful of ms to bind.
	url := fmt.Sprintf("http://%s/healthz", addr)
	var resp *http.Response
	for i := 0; i < 50; i++ {
		time.Sleep(20 * time.Millisecond)
		r, err := http.Get(url)
		if err == nil {
			resp = r
			break
		}
	}
	if resp == nil {
		t.Fatalf("server never became reachable at %s", addr)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if got := body["status"]; got != "ok" {
		t.Fatalf("expected status=ok, got %q", got)
	}
}
