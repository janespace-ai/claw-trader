package aireview

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Spin up a fake DeepSeek and verify: request shape is right (auth header,
// json body, correct URL) and response unwrapping returns the content.
func TestDeepSeekClient_SendsAuthAndJSON(t *testing.T) {
	var gotPath, gotAuth, gotCT string
	var gotBody []byte

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotCT = r.Header.Get("Content-Type")
		gotBody, _ = io.ReadAll(r.Body)

		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"role": "assistant", "content": `{"verdict":"approve","dimensions":{"security":"pass","correctness":"pass"}}`}},
			},
			"usage": map[string]int{"total_tokens": 123},
		})
	}))
	defer srv.Close()

	c := NewDeepSeekClient(srv.URL, "sk-test", 5*time.Second)
	content, tok, err := c.Chat(context.Background(), "deepseek-reasoner",
		[]ChatMessage{{Role: "user", Content: "hi"}})
	if err != nil {
		t.Fatalf("Chat err: %v", err)
	}

	if gotPath != "/v1/chat/completions" {
		t.Errorf("wrong path: %q", gotPath)
	}
	if gotAuth != "Bearer sk-test" {
		t.Errorf("wrong auth: %q", gotAuth)
	}
	if gotCT != "application/json" {
		t.Errorf("wrong content-type: %q", gotCT)
	}
	if !strings.Contains(string(gotBody), `"json_object"`) {
		t.Errorf("body missing json_object response_format: %s", gotBody)
	}
	if !strings.Contains(content, `"verdict":"approve"`) {
		t.Errorf("content mismatched: %q", content)
	}
	if tok != 123 {
		t.Errorf("tokens mismatched: %d", tok)
	}
}

func TestDeepSeekClient_HTTPErrorSurfaced(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":"rate limited"}`, http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := NewDeepSeekClient(srv.URL, "k", time.Second)
	_, _, err := c.Chat(context.Background(), "m", []ChatMessage{{Role: "user", Content: "x"}})
	if err == nil {
		t.Fatal("expected error on 429")
	}
	if !strings.Contains(err.Error(), "429") {
		t.Errorf("error should mention status: %v", err)
	}
}

func TestDeepSeekClient_NoChoicesIsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{}})
	}))
	defer srv.Close()

	c := NewDeepSeekClient(srv.URL, "k", time.Second)
	_, _, err := c.Chat(context.Background(), "m", []ChatMessage{{Role: "user", Content: "x"}})
	if err == nil {
		t.Fatal("expected error on empty choices")
	}
}

// Context cancellation should short-circuit the call and not hang on the
// response body read.
func TestDeepSeekClient_ContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate a slow upstream.
		select {
		case <-r.Context().Done():
			return
		case <-time.After(5 * time.Second):
			_, _ = w.Write([]byte("{}"))
		}
	}))
	defer srv.Close()

	c := NewDeepSeekClient(srv.URL, "k", 5*time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_, _, err := c.Chat(ctx, "m", []ChatMessage{{Role: "user", Content: "x"}})
	if err == nil {
		t.Fatal("expected error on cancelled context")
	}
}
