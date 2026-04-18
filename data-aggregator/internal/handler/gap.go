package handler

import (
	"context"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/service"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// GapHandler serves gap info endpoints.
type GapHandler struct {
	store *store.Store
	svc   *service.SyncService
}

// NewGapHandler constructs the handler.
func NewGapHandler(st *store.Store, svc *service.SyncService) *GapHandler {
	return &GapHandler{store: st, svc: svc}
}

// List handles GET /api/gaps?symbol=&interval=&status=&limit=.
func (h *GapHandler) List(ctx context.Context, c *app.RequestContext) {
	filter := store.GapFilter{
		Symbol:   string(c.Query("symbol")),
		Market:   string(c.Query("market")),
		Interval: string(c.Query("interval")),
		Status:   string(c.Query("status")),
	}
	if filter.Market == "" {
		filter.Market = "futures"
	}
	gaps, err := h.store.QueryGaps(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gaps)
}

type repairRequest struct {
	Symbol   string `json:"symbol"`
	Interval string `json:"interval"`
}

// Repair handles POST /api/gaps/repair, triggering a repair-mode sync in the background.
func (h *GapHandler) Repair(ctx context.Context, c *app.RequestContext) {
	var req repairRequest
	_ = c.BindJSON(&req)
	taskID, err := h.svc.Start(model.SyncModeRepair)
	if err != nil {
		c.JSON(http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, map[string]string{
		"task_id": taskID,
		"status":  model.SyncStatusRunning,
	})
}
