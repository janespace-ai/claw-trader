package router

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"

	"github.com/janespace-ai/claw-trader/service-api/internal/handler"
	"github.com/janespace-ai/claw-trader/service-api/internal/service"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// Register wires routes onto the given Hertz server.
func Register(h *server.Hertz, st *store.Store, bs *service.BacktestService, ss *service.ScreenerService, as *service.AnalysisService) {
	bh := handler.NewBacktestHandler(bs, st)
	sh := handler.NewScreenerHandler(ss, st)
	th := handler.NewStrategyHandler(st)
	svh := handler.NewStrategyVersionsHandler(st)
	ah := handler.NewAnalysisHandler(as)
	ch := handler.NewCallbackHandler(bs, ss)

	// Market-data gateway: these replace the data-aggregator endpoints of
	// the same path. service-api owns frontend reads; data-aggregator is
	// now a headless worker with no external HTTP surface.
	klH := handler.NewKlineHandler(st)
	symH := handler.NewSymbolHandler(st)
	gapH := handler.NewGapHandler(st)
	metaH := handler.NewSymbolMetadataHandler(st)
	engH := handler.NewEngineStatusHandler(st, bs, ss)

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

		api.GET("/strategies/:id/versions", svh.List)
		api.POST("/strategies/:id/versions", svh.Create)
		api.GET("/strategies/:id/versions/:version", svh.Get)

		// Market-data reads (sourced from shared TimescaleDB)
		api.GET("/klines", klH.Query)
		api.GET("/symbols", symH.List)
		api.GET("/symbols/:symbol/metadata", metaH.Get)
		api.GET("/gaps", gapH.List)

		api.GET("/engine/status", engH.Get)

		// Analysis: OptimLens / Signal Review / Trade Explain.
		api.POST("/analysis/optimlens", ah.StartOptimLens)
		api.GET("/analysis/optimlens/:task_id", ah.GetOptimLens)
		api.POST("/analysis/signals", ah.StartSignalReview)
		api.GET("/analysis/signals/:task_id", ah.GetSignalReview)
		api.POST("/analysis/trade", ah.ExplainTrade)
	}

	internal := h.Group("/internal")
	{
		// Canonical shape: sandbox-service workers post with task_id in path.
		internal.POST("/cb/progress/:task_id", ch.Progress)
		internal.POST("/cb/complete/:task_id", ch.Complete)
		internal.POST("/cb/error/:task_id", ch.Error)
	}
}
