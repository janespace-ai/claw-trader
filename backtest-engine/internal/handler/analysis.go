package handler

import (
	"context"
	"encoding/json"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/backtest-engine/internal/errors"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/service"
)

// AnalysisHandler powers the /api/analysis/* endpoints.
type AnalysisHandler struct {
	svc *service.AnalysisService
}

// NewAnalysisHandler constructs the handler.
func NewAnalysisHandler(svc *service.AnalysisService) *AnalysisHandler {
	return &AnalysisHandler{svc: svc}
}

// StartOptimLens handles POST /api/analysis/optimlens.
func (h *AnalysisHandler) StartOptimLens(ctx context.Context, c *app.RequestContext) {
	var req model.OptimLensRequest
	if err := c.BindJSON(&req); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInvalidRange, "bind request: "+err.Error()))
		return
	}
	id, herr := h.svc.StartOptimLens(ctx, req)
	if herr != nil {
		RespondError(c, herr)
		return
	}
	RespondTask(c, model.TaskResponse{
		TaskID:    id,
		Status:    model.TaskStatusFailed, // stub: already failed at creation time
		StartedAt: unixNow(),
		Error: &model.TaskErrorBody{
			Code:    string(apierr.CodeLLMProviderFailed),
			Message: "LLM provider not configured",
		},
	})
}

// GetOptimLens handles GET /api/analysis/optimlens/:task_id.
func (h *AnalysisHandler) GetOptimLens(ctx context.Context, c *app.RequestContext) {
	h.respondWithRun(ctx, c, model.AnalysisTypeOptimLens)
}

// StartSignalReview handles POST /api/analysis/signals.
func (h *AnalysisHandler) StartSignalReview(ctx context.Context, c *app.RequestContext) {
	var req model.SignalReviewRequest
	if err := c.BindJSON(&req); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInvalidRange, "bind request: "+err.Error()))
		return
	}
	id, herr := h.svc.StartSignalReview(ctx, req)
	if herr != nil {
		RespondError(c, herr)
		return
	}
	RespondTask(c, model.TaskResponse{
		TaskID:    id,
		Status:    model.TaskStatusFailed,
		StartedAt: unixNow(),
		Error: &model.TaskErrorBody{
			Code:    string(apierr.CodeLLMProviderFailed),
			Message: "LLM provider not configured",
		},
	})
}

// GetSignalReview handles GET /api/analysis/signals/:task_id.
func (h *AnalysisHandler) GetSignalReview(ctx context.Context, c *app.RequestContext) {
	h.respondWithRun(ctx, c, model.AnalysisTypeSignals)
}

// ExplainTrade handles POST /api/analysis/trade (synchronous).
func (h *AnalysisHandler) ExplainTrade(ctx context.Context, c *app.RequestContext) {
	var req model.TradeExplainRequest
	if err := c.BindJSON(&req); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInvalidRange, "bind request: "+err.Error()))
		return
	}
	_, herr := h.svc.ExplainTrade(ctx, req)
	if herr != nil {
		RespondError(c, herr)
		return
	}
	// Stub never reaches here; kept for when the real impl lands.
	RespondOK(c, map[string]any{})
}

// respondWithRun loads an analysis_runs row, narrows to canonical
// TaskResponse, and writes. 404 on missing.
func (h *AnalysisHandler) respondWithRun(ctx context.Context, c *app.RequestContext, kind string) {
	taskID := c.Param("task_id")
	run, ok, err := h.svc.GetAnalysisStatus(ctx, taskID, kind)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeTaskNotFound, "analysis task not found").
			WithDetails(map[string]any{"task_id": taskID, "type": kind}))
		return
	}
	out := model.TaskResponse{
		TaskID: run.ID,
		Status: mapStatus(run.Status),
	}
	if run.StartedAt != nil {
		out.StartedAt = run.StartedAt.Unix()
	} else {
		out.StartedAt = run.CreatedAt.Unix()
	}
	if run.FinishedAt != nil {
		t := run.FinishedAt.Unix()
		out.FinishedAt = &t
	}
	if len(run.Result) > 0 && out.Status == model.TaskStatusDone {
		var raw any
		_ = json.Unmarshal(run.Result, &raw)
		out.Result = raw
	}
	if len(run.Error) > 0 && out.Status == model.TaskStatusFailed {
		var body model.TaskErrorBody
		if err := json.Unmarshal(run.Error, &body); err == nil {
			out.Error = &body
		}
	}
	RespondTask(c, out)
}
