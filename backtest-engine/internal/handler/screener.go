package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/service"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

// ScreenerHandler handles POST /api/screener/start and GET result.
type ScreenerHandler struct {
	svc   *service.ScreenerService
	store *store.Store
}

// NewScreenerHandler constructs the handler.
func NewScreenerHandler(svc *service.ScreenerService, st *store.Store) *ScreenerHandler {
	return &ScreenerHandler{svc: svc, store: st}
}

type startScreenerReq struct {
	Code       string               `json:"code"`
	Config     model.ScreenerConfig `json:"config"`
	StrategyID *string              `json:"strategy_id,omitempty"`
}

// Start handles POST /api/screener/start.
func (h *ScreenerHandler) Start(ctx context.Context, c *app.RequestContext) {
	var req startScreenerReq
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Code == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "code is required"})
		return
	}
	if req.Config.Market == "" {
		req.Config.Market = "futures"
	}
	if req.Config.LookbackDays <= 0 {
		req.Config.LookbackDays = 365
	}

	runID, err := h.svc.Submit(ctx, req.Code, req.Config, req.StrategyID)
	if err != nil {
		var compErr *service.ComplianceError
		if errors.As(err, &compErr) {
			c.JSON(http.StatusBadRequest, map[string]any{
				"error":   "compliance_failed",
				"details": compErr.Violations,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, map[string]any{
		"task_id": runID,
		"status":  model.StatusPending,
	})
}

// Result handles GET /api/screener/result/:task_id.
func (h *ScreenerHandler) Result(ctx context.Context, c *app.RequestContext) {
	taskID := c.Param("task_id")
	run, ok, err := h.store.GetScreenerRun(ctx, taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if !ok {
		c.JSON(http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}
	if run.Status == model.StatusRunning || run.Status == model.StatusPending {
		c.JSON(http.StatusAccepted, map[string]any{
			"task_id": run.ID, "status": run.Status,
			"message": "task still in progress",
		})
		return
	}
	c.JSON(http.StatusOK, run)
}
