package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/service-api/internal/service"
)

// CallbackHandler serves /internal/cb/{progress,complete,error}/:task_id
// from sandbox-service workers.
//
// Historical note: the legacy per-task Docker runner posted to
// `/internal/cb/{channel}` with task_id in the body.  The new sandbox-service
// puts the job_id in the URL path (it's already an identifier — no reason
// to duplicate it in the body).  Handlers read from the path param and
// fall back to the body field for compatibility if anyone still posts the
// old shape.
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

// Progress handles POST /internal/cb/progress/:task_id.
func (h *CallbackHandler) Progress(ctx context.Context, c *app.RequestContext) {
	var p progressPayload
	if err := c.BindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	taskID := resolveTaskID(c, p.TaskID)
	// Route to the right service by attempting both; whichever matches a row wins.
	_ = h.backtest.HandleProgress(ctx, taskID, p)
	c.JSON(http.StatusOK, map[string]string{"ok": "1"})
}

type completePayload struct {
	TaskID string          `json:"task_id"`
	Mode   string          `json:"mode"`
	Result json.RawMessage `json:"result"`
}

// Complete handles POST /internal/cb/complete/:task_id.
func (h *CallbackHandler) Complete(ctx context.Context, c *app.RequestContext) {
	var p completePayload
	if err := c.BindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	taskID := resolveTaskID(c, p.TaskID)
	var dispatchErr error
	if p.Mode == "screener" {
		dispatchErr = h.screener.HandleComplete(ctx, taskID, p.Result)
	} else {
		dispatchErr = h.backtest.HandleComplete(ctx, taskID, p.Result)
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

// Error handles POST /internal/cb/error/:task_id.
func (h *CallbackHandler) Error(ctx context.Context, c *app.RequestContext) {
	var p errorPayload
	if err := c.BindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	taskID := resolveTaskID(c, p.TaskID)
	if p.Mode == "screener" {
		_ = h.screener.HandleError(ctx, taskID, p.Error)
	} else {
		_ = h.backtest.HandleError(ctx, taskID, p.Error)
	}
	c.JSON(http.StatusOK, map[string]string{"ok": "1"})
}

// resolveTaskID prefers the URL path param (canonical) but falls back to the
// body field if no path param was captured — handy during the migration when
// both URL shapes might briefly coexist, and harmless afterwards.
func resolveTaskID(c *app.RequestContext, fromBody string) string {
	if id := c.Param("task_id"); id != "" {
		return id
	}
	return fromBody
}
