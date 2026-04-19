package handler

import (
	"context"
	stderrors "errors"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/backtest-engine/internal/errors"
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
		RespondError(c, apierr.Wrap(err, apierr.CodeInvalidRange, "bind request: "+err.Error()))
		return
	}
	if req.Code == "" {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "code is required"))
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
		if stderrors.As(err, &compErr) {
			RespondError(c, apierr.New(apierr.CodeComplianceFailed, "compliance failed").
				WithDetails(map[string]any{"violations": compErr.Violations}))
			return
		}
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	RespondTask(c, model.TaskResponse{
		TaskID:    runID,
		Status:    model.TaskStatusPending,
		StartedAt: unixNow(),
	})
}

// Result handles GET /api/screener/result/:task_id.
func (h *ScreenerHandler) Result(ctx context.Context, c *app.RequestContext) {
	taskID := c.Param("task_id")
	run, ok, err := h.store.GetScreenerRun(ctx, taskID)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeScreenerNotFound, "screener task not found").
			WithDetails(map[string]any{"task_id": taskID}))
		return
	}
	RespondTask(c, toTaskResponseScreener(run))
}
