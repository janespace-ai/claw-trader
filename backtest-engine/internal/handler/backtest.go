package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/service"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

// BacktestHandler handles POST /api/backtest/start, GET status/result/history.
type BacktestHandler struct {
	svc   *service.BacktestService
	store *store.Store
}

// NewBacktestHandler constructs the handler.
func NewBacktestHandler(svc *service.BacktestService, st *store.Store) *BacktestHandler {
	return &BacktestHandler{svc: svc, store: st}
}

type startBacktestReq struct {
	Code       string               `json:"code"`
	Config     model.BacktestConfig `json:"config"`
	StrategyID *string              `json:"strategy_id,omitempty"`
	Mode       string               `json:"mode,omitempty"` // default 'single'
}

// Start handles POST /api/backtest/start.
func (h *BacktestHandler) Start(ctx context.Context, c *app.RequestContext) {
	var req startBacktestReq
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Code == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "code is required"})
		return
	}
	if req.Mode == "" {
		req.Mode = model.ModeSingle
	}

	runID, err := h.svc.SubmitBacktest(ctx, service.SubmitOptions{
		Code: req.Code, Config: req.Config,
		StrategyID: req.StrategyID, Mode: req.Mode,
	})
	if err != nil {
		var compErr *service.ComplianceError
		if errors.As(err, &compErr) {
			c.JSON(http.StatusBadRequest, map[string]any{
				"error":   "compliance_failed",
				"details": compErr.Violations,
			})
			return
		}
		// Single-in-flight conflict
		c.JSON(http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, map[string]any{
		"task_id": runID,
		"status":  model.StatusPending,
		"mode":    req.Mode,
	})
}

// Status handles GET /api/backtest/status/:task_id.
func (h *BacktestHandler) Status(ctx context.Context, c *app.RequestContext) {
	taskID := c.Param("task_id")
	run, ok, err := h.store.GetBacktestRun(ctx, taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if !ok {
		c.JSON(http.StatusNotFound, map[string]string{"error": "task_not_found"})
		return
	}
	c.JSON(http.StatusOK, run)
}

// Result handles GET /api/backtest/result/:task_id.
func (h *BacktestHandler) Result(ctx context.Context, c *app.RequestContext) {
	taskID := c.Param("task_id")
	run, ok, err := h.store.GetBacktestRun(ctx, taskID)
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

// History handles GET /api/backtest/history?strategy_id=&limit=.
func (h *BacktestHandler) History(ctx context.Context, c *app.RequestContext) {
	strategyID := string(c.Query("strategy_id"))
	limit := 20
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	runs, err := h.store.ListBacktestRuns(ctx, strategyID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, runs)
}
