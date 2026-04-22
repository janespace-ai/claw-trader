// Package sandboxclient is backtest-engine's side of the wire to
// sandbox-service.  It replaces the old per-task Docker container launch
// with a small HTTP client (POST /run, GET /status, GET /healthz).
//
// The design intentionally minimal:
//
//   - No in-client retries for /run: if sandbox-service is unreachable, the
//     submit should fail fast so the user sees the error; retrying would
//     smear the failure over 30 s of unexplained silence.
//   - /status is polled on demand (by GET-status handlers or watchdogs);
//     we do not maintain a background poller.  Progress callbacks drive
//     the UI, and on the rare case sandbox-service crashes mid-job, GC in
//     the service marks jobs failed (see pool/master.py _gc_once).
//   - /healthz is used at boot by the engine's startup probe and by tests.
//
// Callbacks: sandbox-service POSTs to
// ``{callback_base_url}/internal/cb/{progress,complete,error}/{job_id}``.
// The engine already handles these via ``handler.CallbackHandler``.
package sandboxclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DBCreds is the readonly DB info the sandbox worker needs to open a
// DBReader.  Mirrors the ``DBCredsIn`` pydantic model on the server side
// (sandbox-service/src/api/schema.py).
type DBCreds struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// RunRequest is the POST /run body.
type RunRequest struct {
	JobID           string         `json:"job_id"`
	TaskID          string         `json:"task_id"`
	Mode            string         `json:"mode"` // backtest | screener | optimization
	Code            string         `json:"code"`
	Config          map[string]any `json:"config"`
	CallbackBaseURL string         `json:"callback_base_url"`
	DB              DBCreds        `json:"db"`
}

// RunResponse is the POST /run 202 body.
type RunResponse struct {
	JobID  string `json:"job_id"`
	Status string `json:"status"` // always "queued"
}

// StatusResponse is the GET /status/{job_id} body.
type StatusResponse struct {
	JobID      string   `json:"job_id"`
	Status     string   `json:"status"` // queued | running | done | failed
	WorkerID   *int     `json:"worker_id,omitempty"`
	QueuedAt   float64  `json:"queued_at"`
	StartedAt  *float64 `json:"started_at,omitempty"`
	FinishedAt *float64 `json:"finished_at,omitempty"`
	Error      string   `json:"error"`
}

// HealthResponse is the GET /healthz body.
type HealthResponse struct {
	Ready         bool `json:"ready"`
	WorkersReady  int  `json:"workers_ready"`
	WorkersTotal  int  `json:"workers_total"`
	ShuttingDown  bool `json:"shutting_down"`
}

// Client talks to a single sandbox-service instance.
//
// Construct once at boot and share — the underlying http.Client manages a
// connection pool, so reuse is important.
type Client struct {
	baseURL string
	http    *http.Client
}

// New returns a Client rooted at baseURL.  ``timeout`` applies to each
// individual HTTP call.  A 10 s timeout is reasonable for /run (the service
// is just enqueuing; no user code is executed inline) and /status (cheap
// in-memory read).
func New(baseURL string, timeout time.Duration) *Client {
	baseURL = strings.TrimRight(baseURL, "/")
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: timeout},
	}
}

// Run posts a job to /run and returns sandbox-service's ack.
//
// Typical latency: single-digit milliseconds — sandbox-service only queues.
// Errors: ErrHostUnreachable wraps connection failures so callers can
// distinguish them from 4xx (bad request) for the right user-facing message.
func (c *Client) Run(ctx context.Context, req RunRequest) (*RunResponse, error) {
	var resp RunResponse
	if err := c.do(ctx, http.MethodPost, "/run", req, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// Status polls /status/{job_id}.  404 returns (nil, nil) — the job
// either never existed or expired out of the in-memory status table.
func (c *Client) Status(ctx context.Context, jobID string) (*StatusResponse, error) {
	var resp StatusResponse
	err := c.do(ctx, http.MethodGet, "/status/"+jobID, nil, &resp)
	if err != nil {
		var httpErr *HTTPError
		if asErr(err, &httpErr) && httpErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &resp, nil
}

// Healthz returns the health snapshot.  sandbox-service returns 503 while
// workers are still warming up; Healthz surfaces that via the Ready flag
// AND as a non-nil error so callers that only check err behave correctly.
func (c *Client) Healthz(ctx context.Context) (*HealthResponse, error) {
	var resp HealthResponse
	err := c.do(ctx, http.MethodGet, "/healthz", nil, &resp)
	if err != nil {
		var httpErr *HTTPError
		if asErr(err, &httpErr) && httpErr.Status == http.StatusServiceUnavailable {
			// Still return the parsed body — the caller wants to know
			// workers_ready / total for logs / diagnostics.
			_ = json.Unmarshal([]byte(httpErr.Body), &resp)
			return &resp, err
		}
		return nil, err
	}
	return &resp, nil
}

// ---- wire helpers ----------------------------------------------------------

// HTTPError captures a non-2xx response with enough context for callers
// to distinguish categories (4xx vs 5xx) and for logs (body snippet).
type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string {
	snippet := e.Body
	if len(snippet) > 300 {
		snippet = snippet[:300] + "…"
	}
	return fmt.Sprintf("sandbox-service HTTP %d: %s", e.Status, snippet)
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal body: %w", err)
		}
		reader = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("sandbox-service %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBytes, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if readErr != nil {
		return fmt.Errorf("read response: %w", readErr)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &HTTPError{Status: resp.StatusCode, Body: string(respBytes)}
	}
	if out == nil || len(respBytes) == 0 {
		return nil
	}
	if err := json.Unmarshal(respBytes, out); err != nil {
		return fmt.Errorf("decode response: %w (body=%q)", err, truncate(string(respBytes), 300))
	}
	return nil
}

// asErr is a local errors.As to avoid an extra import + keep the client
// file self-contained.
func asErr(err error, target **HTTPError) bool {
	for cur := err; cur != nil; {
		if he, ok := cur.(*HTTPError); ok {
			*target = he
			return true
		}
		type unwrapper interface{ Unwrap() error }
		if u, ok := cur.(unwrapper); ok {
			cur = u.Unwrap()
			continue
		}
		break
	}
	return false
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
