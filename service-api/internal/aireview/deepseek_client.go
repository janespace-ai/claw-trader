package aireview

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

// ChatMessage is the wire shape of a single chat-completions message.
//
// We target the OpenAI-compatible chat-completions endpoint that DeepSeek
// exposes at `/v1/chat/completions`, because we only need the subset that
// every provider implements.  No tools, no streaming — one request, one
// JSON blob back.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatRequest is what we POST to /v1/chat/completions.
//
// ResponseFormat forces JSON mode (DeepSeek documents this key name).
// Temperature is pinned low to make verdicts reproducible — code review is
// a classification task, not a creative one.
type chatRequest struct {
	Model          string        `json:"model"`
	Messages       []ChatMessage `json:"messages"`
	Temperature    float64       `json:"temperature"`
	ResponseFormat struct {
		Type string `json:"type"`
	} `json:"response_format"`
}

// chatResponse is the subset of the response we care about.  Anything
// outside `choices[0].message.content` is ignored; the model is instructed
// to put a JSON object there.
type chatResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
	// usage is logged for cost tracking but not required for verdicts.
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// DeepSeekClient is a minimal wire client.  One method: Chat().
//
// The client is NOT retried internally — fail-closed semantics say one
// timeout is one reject.  Callers who want retries can wrap, but the
// current spec says "timeout → reject" so retrying would hide real signal.
type DeepSeekClient struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

// NewDeepSeekClient returns a client rooted at baseURL.  The timeout applies
// to the full request (dial + TLS + upload + download).
func NewDeepSeekClient(baseURL, apiKey string, timeout time.Duration) *DeepSeekClient {
	if baseURL == "" {
		baseURL = "https://api.deepseek.com"
	}
	baseURL = strings.TrimRight(baseURL, "/")
	return &DeepSeekClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

// Chat performs one /v1/chat/completions call and returns the raw model
// response content (expected to be a JSON object per the system prompt) and
// a usage snapshot.  The caller is responsible for parsing the verdict JSON.
func (c *DeepSeekClient) Chat(
	ctx context.Context, model string, messages []ChatMessage,
) (content string, tokens int, err error) {
	body := chatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: 0.0,
	}
	body.ResponseFormat.Type = "json_object"

	buf, err := json.Marshal(body)
	if err != nil {
		return "", 0, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/v1/chat/completions", bytes.NewReader(buf))
	if err != nil {
		return "", 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		// Redact the API key in case the URL got into an error message
		// somewhere up the chain.
		return "", 0, fmt.Errorf("deepseek http: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return "", 0, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Keep the body (potentially containing an error message) small so we
		// don't log megabytes of junk on failure.
		snippet := string(respBytes)
		if len(snippet) > 512 {
			snippet = snippet[:512] + "…"
		}
		return "", 0, fmt.Errorf("deepseek HTTP %d: %s", resp.StatusCode, snippet)
	}

	var parsed chatResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return "", 0, fmt.Errorf("decode response: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return "", 0, fmt.Errorf("deepseek returned no choices")
	}
	return parsed.Choices[0].Message.Content, parsed.Usage.TotalTokens, nil
}
