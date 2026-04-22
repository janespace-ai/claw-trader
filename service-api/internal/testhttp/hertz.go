// Package testhttp mirrors data-aggregator/internal/testhttp: a minimal
// helper for driving Hertz handlers directly from Go tests.
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

type HandlerFunc func(ctx context.Context, c *app.RequestContext)

func Call(t *testing.T, h HandlerFunc, method, path string, query url.Values, body any) *protocol.Response {
	t.Helper()

	fullPath := path
	if len(query) > 0 {
		fullPath = path + "?" + query.Encode()
	}

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

func DecodeJSON(t *testing.T, resp *protocol.Response, dst any) {
	t.Helper()
	b := resp.Body()
	if err := json.NewDecoder(bytes.NewReader(b)).Decode(dst); err != nil {
		t.Fatalf("decode response JSON: %v; body=%q", err, string(b))
	}
}

func Status(resp *protocol.Response) int { return resp.StatusCode() }
func Body(resp *protocol.Response) string { return string(resp.Body()) }

func MustQuery(kv ...string) url.Values {
	if len(kv)%2 != 0 {
		panic(fmt.Sprintf("MustQuery expects an even number of args, got %d", len(kv)))
	}
	q := url.Values{}
	for i := 0; i < len(kv); i += 2 {
		q.Set(kv[i], kv[i+1])
	}
	return q
}
