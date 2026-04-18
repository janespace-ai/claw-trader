package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/service"
)

// CallbackHandler serves /internal/cb/{progress,complete,error} from sandbox containers.
type CallbackHandler struct {
	backtest *service.BacktestService
	screener *service.ScreenerService
}

// NewCallbackHandler wires the callback endpoints to their services.
func NewCallbackHandler(b *service.BacktestService, s *service.ScreenerService) *CallbackHandler {
	return &CallbackHandler{backtest: b, screener: s}
}

type progressPayload struct {
	TaskID     string `json:"task_id"`
	Phase      string `json:"phase"`
	CurrentBar int64  `json:"current_bar"`
	TotalBars  int64  `json:"total_bars"`
	CurrentRun int    `json:"current_run"`
	TotalRuns  int    `json:"total_runs"`
	Message    string `json:"message"`
}

// Progress handles POST /internal/cb/progress.
func (h *CallbackHandler) Progress(ctx context.Context, c *app.RequestContext) {
	var p progressPayload
	if err := c.BindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	// Route to the right service by attempting both; whichever matches a row wins.
	_ = h.backtest.HandleProgress(ctx, p.TaskID, p)
	c.JSON(http.StatusOK, map[string]string{"ok": "1"})
}

type completePayload struct {
	TaskID string          `json:"task_id"`
	Mode   string          `json:"mode"`
	Result json.RawMessage `json:"result"`
}

// Complete handles POST /internal/cb/complete.
func (h *CallbackHandler) Complete(ctx context.Context, c *app.RequestContext) {
	var p completePayload
	if err := c.BindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	var dispatchErr error
	if p.Mode == "screener" {
		dispatchErr = h.screener.HandleComplete(ctx, p.TaskID, p.Result)
	} else {
		dispatchErr = h.backtest.HandleComplete(ctx, p.TaskID, p.Result)
	}
	if dispatchErr != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": dispatchErr.Error()})
		return
	}
	c.JSON(http.StatusOK, map[string]string{"ok": "1"})
}

type errorPayload struct {
	TaskID    string `json:"task_id"`
	Mode      string `json:"mode,omitempty"`
	Error     string `json:"error"`
	Traceback string `json:"traceback"`
}

// Error handles POST /internal/cb/error.
func (h *CallbackHandler) Error(ctx context.Context, c *app.RequestContext) {
	var p errorPayload
	if err := c.BindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if p.Mode == "screener" {
		_ = h.screener.HandleError(ctx, p.TaskID, p.Error)
	} else {
		_ = h.backtest.HandleError(ctx, p.TaskID, p.Error)
	}
	c.JSON(http.StatusOK, map[string]string{"ok": "1"})
}
