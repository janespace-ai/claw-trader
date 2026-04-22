package aireview

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/config"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/testdb"
)

// Helper: build a Service with a fake DeepSeek server pinned to ``replyContent``.
// Returns the service, the server, and a counter that tracks how many times
// the server was hit (so we can assert cache hits).
func newServiceWithReply(t *testing.T, replyContent string) (*Service, *httptest.Server, *int64) {
	t.Helper()

	var hits int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt64(&hits, 1)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"role": "assistant", "content": replyContent}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	st := testdb.New(t)
	cfg := config.AIReviewConfig{
		Enabled: true, APIKey: "sk-test", BaseURL: srv.URL,
		Model: "deepseek-reasoner", TimeoutSeconds: 5,
		CacheTTLDays: 30, PromptVersion: "v1",
	}
	svc := NewService(cfg, st.Pool(), st.Schema())

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := svc.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}

	return svc, srv, &hits
}

func TestService_ApprovePath(t *testing.T) {
	svc, _, hits := newServiceWithReply(t,
		`{"verdict":"approve","dimensions":{"security":"pass","correctness":"pass"}}`)

	v, err := svc.Review(context.Background(), "x = 1\n", "backtest", "task-a")
	if err != nil {
		t.Fatalf("Review err: %v", err)
	}
	if !v.IsApproved() {
		t.Fatalf("expected approve, got %+v", v)
	}
	if v.CacheHit {
		t.Fatal("first call should not be a cache hit")
	}
	if atomic.LoadInt64(hits) != 1 {
		t.Fatalf("model called %d times, want 1", *hits)
	}
}

func TestService_RejectPath(t *testing.T) {
	svc, _, _ := newServiceWithReply(t,
		`{"verdict":"reject","reason":"uses os.system","dimensions":{"security":"fail","correctness":"pass"}}`)

	v, err := svc.Review(context.Background(), "import os; os.system('x')\n", "backtest", "task-r")
	if err != nil {
		t.Fatalf("Review err: %v", err)
	}
	if v.IsApproved() {
		t.Fatal("expected reject")
	}
	if v.Reason != "uses os.system" {
		t.Errorf("reason not preserved: %q", v.Reason)
	}
}

func TestService_CacheHitSkipsModel(t *testing.T) {
	svc, _, hits := newServiceWithReply(t,
		`{"verdict":"approve","dimensions":{"security":"pass","correctness":"pass"}}`)

	code := "x = 42\n"
	if _, err := svc.Review(context.Background(), code, "backtest", "t1"); err != nil {
		t.Fatalf("first: %v", err)
	}
	v, err := svc.Review(context.Background(), code, "backtest", "t2")
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if !v.CacheHit {
		t.Fatal("second call should be cache hit")
	}
	if atomic.LoadInt64(hits) != 1 {
		t.Fatalf("model should only be called once; got %d", *hits)
	}
}

func TestService_TimeoutBecomesReject(t *testing.T) {
	// Server that never responds — client hits its own timeout.
	block := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-block
	}))
	defer func() { close(block); srv.Close() }()

	st := testdb.New(t)
	cfg := config.AIReviewConfig{
		Enabled: true, APIKey: "sk-test", BaseURL: srv.URL,
		Model: "deepseek-reasoner", TimeoutSeconds: 1, // 1 sec client timeout
		CacheTTLDays: 30, PromptVersion: "v1",
	}
	svc := NewService(cfg, st.Pool(), st.Schema())

	v, err := svc.Review(context.Background(), "x = 1", "backtest", "t-timeout")
	if err != nil {
		t.Fatalf("Review should fail-closed, not error: %v", err)
	}
	if v.IsApproved() {
		t.Fatal("timeout must not approve")
	}
}

func TestService_ParseFailBecomesReject(t *testing.T) {
	svc, _, _ := newServiceWithReply(t, "not JSON at all, neither approved nor rejected")

	v, err := svc.Review(context.Background(), "x=1", "backtest", "t-pf")
	if err != nil {
		t.Fatalf("Review should not error: %v", err)
	}
	if v.IsApproved() {
		t.Fatal("unparseable response must not approve")
	}
}

func TestService_DisabledReturnsUnavailable(t *testing.T) {
	st := testdb.New(t)
	cfg := config.AIReviewConfig{
		Enabled: false, APIKey: "sk-test", Model: "x",
		TimeoutSeconds: 5, CacheTTLDays: 30, PromptVersion: "v1",
	}
	svc := NewService(cfg, st.Pool(), st.Schema())

	_, err := svc.Review(context.Background(), "x=1", "backtest", "t-off")
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected ErrUnavailable, got %v", err)
	}
}

func TestService_MissingAPIKeyIsUnavailable(t *testing.T) {
	st := testdb.New(t)
	cfg := config.AIReviewConfig{
		Enabled: true, APIKey: "", Model: "x",
		TimeoutSeconds: 5, CacheTTLDays: 30, PromptVersion: "v1",
	}
	svc := NewService(cfg, st.Pool(), st.Schema())

	_, err := svc.Review(context.Background(), "x=1", "backtest", "t-nokey")
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected ErrUnavailable, got %v", err)
	}
}

func TestService_ModelDriftPurgesCache(t *testing.T) {
	svc, _, hits := newServiceWithReply(t,
		`{"verdict":"approve","dimensions":{"security":"pass","correctness":"pass"}}`)

	// Warm cache.
	code := "x = 1"
	if _, err := svc.Review(context.Background(), code, "backtest", ""); err != nil {
		t.Fatalf("warm: %v", err)
	}

	// Manually tamper: flip the stored model so the next Start() call finds
	// the row "stale" and purges it.  Simulate the "operator changed model in
	// config" scenario.
	_, err := svc.cache.pool.Exec(context.Background(),
		"UPDATE "+svc.cache.schema+".ai_review_cache SET model = 'old-model'")
	if err != nil {
		t.Fatalf("tamper: %v", err)
	}

	if err := svc.Start(context.Background()); err != nil {
		t.Fatalf("restart: %v", err)
	}

	// Fresh Review should miss (we purged) → second model hit.
	if _, err := svc.Review(context.Background(), code, "backtest", ""); err != nil {
		t.Fatalf("second review: %v", err)
	}
	if atomic.LoadInt64(hits) != 2 {
		t.Fatalf("expected 2 model hits after purge; got %d", *hits)
	}
}
