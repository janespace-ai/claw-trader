package router

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
)

// Register wires the minimal HTTP surface onto the given Hertz server.
//
// data-aggregator is a headless worker: it runs its sync pipeline on boot and
// does not expose business APIs to the frontend. The only route kept is a
// liveness probe, and the server is expected to bind to 127.0.0.1 (see config).
func Register(h *server.Hertz) {
	h.GET("/healthz", func(ctx context.Context, c *app.RequestContext) {
		c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})
}
