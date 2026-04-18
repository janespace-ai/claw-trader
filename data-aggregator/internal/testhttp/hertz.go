// Package testhttp provides a small helper for driving Hertz handlers
// directly inside Go tests, without spinning up a real HTTP server.
//
// Hertz doesn't ship a ready-made httptest analogue; directly invoking a
// handler with a constructed RequestContext is the simplest path.
package testhttp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"testing"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/protocol"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

// HandlerFunc is the signature Hertz handlers take.
type HandlerFunc func(ctx context.Context, c *app.RequestContext)

// Call invokes a Hertz handler with a freshly built RequestContext and
// returns the resulting response. JSON body (if non-nil) is marshalled
// and set on the request.
//
// `query` is serialised using net/url.Values.Encode() and appended to
// the path. Query keys that are set but whose slice value is empty are
// still emitted as "?key=" — matching the typical form-encoding idiom.
func Call(t *testing.T, h HandlerFunc, method, path string, query url.Values, body any) *protocol.Response {
	t.Helper()

	fullPath := path
	if len(query) > 0 {
		fullPath = path + "?" + query.Encode()
	}

	// app.NewContext(capacity) gives us a ready-to-use RequestContext
	// with internal response/request byte buffers.
	c := app.NewContext(16)
	c.Request.SetMethod(method)
	c.Request.SetRequestURI(fullPath)
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		c.Request.SetBody(raw)
		c.Request.Header.SetContentTypeBytes([]byte(consts.MIMEApplicationJSON))
	}

	h(context.Background(), c)
	return &c.Response
}

// DecodeJSON parses the response body into the given destination. It fails
// the test on decode error.
func DecodeJSON(t *testing.T, resp *protocol.Response, dst any) {
	t.Helper()
	b := resp.Body()
	if err := json.NewDecoder(bytes.NewReader(b)).Decode(dst); err != nil {
		t.Fatalf("decode response JSON: %v; body=%q", err, string(b))
	}
}

// Status returns the numeric HTTP status code from a response.
func Status(resp *protocol.Response) int {
	return resp.StatusCode()
}

// Body returns the raw response body as a string (for assertion messages).
func Body(resp *protocol.Response) string {
	return string(resp.Body())
}

// MustQuery is a small convenience: it builds a url.Values from alternating
// key/value string pairs. Panics on odd input length (test code only).
func MustQuery(kv ...string) url.Values {
	if len(kv)%2 != 0 {
		panic(fmt.Sprintf("MustQuery expects an even number of arguments, got %d", len(kv)))
	}
	q := url.Values{}
	for i := 0; i < len(kv); i += 2 {
		q.Set(kv[i], kv[i+1])
	}
	return q
}
