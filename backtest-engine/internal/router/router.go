package router

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/handler"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/service"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

// Register wires routes onto the given Hertz server.
func Register(h *server.Hertz, st *store.Store, bs *service.BacktestService, ss *service.ScreenerService) {
	bh := handler.NewBacktestHandler(bs, st)
	sh := handler.NewScreenerHandler(ss, st)
	th := handler.NewStrategyHandler(st)
	ch := handler.NewCallbackHandler(bs, ss)

	h.GET("/healthz", func(ctx context.Context, c *app.RequestContext) {
		c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	api := h.Group("/api")
	{
		api.POST("/backtest/start", bh.Start)
		api.GET("/backtest/status/:task_id", bh.Status)
		api.GET("/backtest/result/:task_id", bh.Result)
		api.GET("/backtest/history", bh.History)

		api.POST("/screener/start", sh.Start)
		api.GET("/screener/result/:task_id", sh.Result)

		api.POST("/strategies", th.Create)
		api.GET("/strategies", th.List)
		api.GET("/strategies/:id", th.Get)
	}

	internal := h.Group("/internal")
	{
		internal.POST("/cb/progress", ch.Progress)
		internal.POST("/cb/complete", ch.Complete)
		internal.POST("/cb/error", ch.Error)
	}
}
