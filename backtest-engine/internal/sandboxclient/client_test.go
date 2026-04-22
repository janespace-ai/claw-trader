package sandboxclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Spin up a stub sandbox-service and verify Run() sends the right body and
// unwraps the response correctly.
func TestClient_RunOK(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/run" {
			t.Errorf("expected /run, got %s", r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(RunResponse{JobID: "j1", Status: "queued"})
	}))
	defer srv.Close()

	c := New(srv.URL, time.Second)
	resp, err := c.Run(context.Background(), RunRequest{
		JobID: "j1", TaskID: "t1", Mode: "backtest",
		Code:            "x = 1",
		Config:          map[string]any{"interval": "1h"},
		CallbackBaseURL: "http://engine:8081",
		DB:              DBCreds{Host: "ts", Port: 5432, User: "ro", Password: "x", Name: "claw"},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if resp.JobID != "j1" || resp.Status != "queued" {
		t.Fatalf("bad response: %+v", resp)
	}
	// Body sanity — we sent what we think we sent.
	if gotBody["job_id"] != "j1" {
		t.Errorf("body missing job_id: %+v", gotBody)
	}
	if gotBody["mode"] != "backtest" {
		t.Errorf("body missing mode: %+v", gotBody)
	}
}

func TestClient_RunHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"detail":{"code":"CALLBACK_HOST_NOT_ALLOWED"}}`, http.StatusBadRequest)
	}))
	defer srv.Close()

	c := New(srv.URL, time.Second)
	_, err := c.Run(context.Background(), RunRequest{JobID: "j", Mode: "backtest"})
	if err == nil {
		t.Fatal("expected error on 400")
	}
	if !strings.Contains(err.Error(), "400") {
		t.Errorf("error should mention status: %v", err)
	}
}

func TestClient_StatusOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/status/") {
			t.Errorf("bad path: %s", r.URL.Path)
		}
		wid := 2
		queuedAt := 1700000000.0
		startedAt := 1700000001.0
		_ = json.NewEncoder(w).Encode(StatusResponse{
			JobID: "jx", Status: "running", WorkerID: &wid,
			QueuedAt: queuedAt, StartedAt: &startedAt,
		})
	}))
	defer srv.Close()

	c := New(srv.URL, time.Second)
	s, err := c.Status(context.Background(), "jx")
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if s == nil || s.Status != "running" {
		t.Fatalf("bad status: %+v", s)
	}
}

func TestClient_Status404IsNilNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer srv.Close()

	c := New(srv.URL, time.Second)
	s, err := c.Status(context.Background(), "gone")
	if err != nil {
		t.Fatalf("404 should not be an error: %v", err)
	}
	if s != nil {
		t.Fatalf("expected nil, got %+v", s)
	}
}

func TestClient_HealthzReady(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(HealthResponse{
			Ready: true, WorkersReady: 4, WorkersTotal: 4,
		})
	}))
	defer srv.Close()

	c := New(srv.URL, time.Second)
	h, err := c.Healthz(context.Background())
	if err != nil {
		t.Fatalf("Healthz: %v", err)
	}
	if !h.Ready || h.WorkersReady != 4 {
		t.Fatalf("unexpected health: %+v", h)
	}
}

func TestClient_Healthz503SurfacesBodyPlusError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(HealthResponse{
			Ready: false, WorkersReady: 2, WorkersTotal: 4,
		})
	}))
	defer srv.Close()

	c := New(srv.URL, time.Second)
	h, err := c.Healthz(context.Background())
	if err == nil {
		t.Fatal("expected error on 503")
	}
	if h == nil || h.WorkersReady != 2 {
		t.Fatalf("503 body should still parse: %+v", h)
	}
}
