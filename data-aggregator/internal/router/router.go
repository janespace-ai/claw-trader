package router

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/handler"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/service"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// Register wires every HTTP endpoint onto the given Hertz server.
func Register(h *server.Hertz, st *store.Store, svc *service.SyncService) {
	syncH := handler.NewSyncHandler(svc)
	symH := handler.NewSymbolHandler(st)
	gapH := handler.NewGapHandler(st, svc)
	klH := handler.NewKlineHandler(st)

	h.GET("/healthz", func(ctx context.Context, c *app.RequestContext) {
		c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	api := h.Group("/api")
	{
		// Sync
		api.POST("/sync/start", syncH.Start)
		api.GET("/sync/status", syncH.Status)

		// Symbols
		api.GET("/symbols", symH.List)

		// Gaps
		api.GET("/gaps", gapH.List)
		api.POST("/gaps/repair", gapH.Repair)

		// Klines
		api.GET("/klines", klH.Query)
	}
}
