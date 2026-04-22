package handler

import (
	"context"
	stderrors "errors"
	"net/http"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
	"github.com/janespace-ai/claw-trader/service-api/internal/service"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
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

// Start handles POST /api/backtest/start. Responds with a canonical
// `TaskResponse` envelope.
func (h *BacktestHandler) Start(ctx context.Context, c *app.RequestContext) {
	var req startBacktestReq
	if err := c.BindJSON(&req); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInvalidRange, "bind request: "+err.Error()))
		return
	}
	if req.Code == "" {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "code is required"))
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
		if stderrors.As(err, &compErr) {
			RespondError(c, apierr.New(apierr.CodeComplianceFailed, "compliance failed").
				WithDetails(map[string]any{"violations": compErr.Violations}))
			return
		}
		var aiRejErr *service.AIRejectedError
		if stderrors.As(err, &aiRejErr) {
			RespondError(c, apierr.New(apierr.CodeAIRejected, "code rejected by AI reviewer").
				WithDetails(map[string]any{
					"reason":     aiRejErr.Reason,
					"model":      aiRejErr.Model,
					"dimensions": aiRejErr.Dimensions,
				}))
			return
		}
		var aiUnavailErr *service.AIUnavailableError
		if stderrors.As(err, &aiUnavailErr) {
			// Do not leak the internal cause to the user.  Ops sees it in logs via the wrapped error.
			RespondError(c, apierr.Wrap(err, apierr.CodeAIReviewUnavailable,
				"ai reviewer temporarily unavailable; please retry"))
			return
		}
		// Single-in-flight conflict or other service error.
		he := apierr.Wrap(err, apierr.CodeInternalError, err.Error())
		he.Status = http.StatusConflict
		RespondError(c, he)
		return
	}
	RespondTask(c, model.TaskResponse{
		TaskID:    runID,
		Status:    model.TaskStatusPending,
		StartedAt: unixNow(),
	})
}

// Status handles GET /api/backtest/status/:task_id.
func (h *BacktestHandler) Status(ctx context.Context, c *app.RequestContext) {
	taskID := c.Param("task_id")
	run, ok, err := h.store.GetBacktestRun(ctx, taskID)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeBacktestNotFound, "backtest not found").
			WithDetails(map[string]any{"task_id": taskID}))
		return
	}
	RespondTask(c, toTaskResponse(run))
}

// Result handles GET /api/backtest/result/:task_id. Unlike the old
// implementation this returns 200 even for in-progress tasks — the
// canonical TaskResponse envelope carries that information via
// `status` and never uses 202.
func (h *BacktestHandler) Result(ctx context.Context, c *app.RequestContext) {
	taskID := c.Param("task_id")
	run, ok, err := h.store.GetBacktestRun(ctx, taskID)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeBacktestNotFound, "backtest not found").
			WithDetails(map[string]any{"task_id": taskID}))
		return
	}
	RespondTask(c, toTaskResponse(run))
}

// historyCursor is the opaque resume-point structure for paginated
// history listing. base64(json(historyCursor)).
type historyCursor struct {
	CreatedAtUnix int64 `json:"c"`
}

// History handles GET /api/backtest/history?strategy_id=&limit=&cursor=.
// Returns a canonical Paginated<BacktestHistoryItem>.
func (h *BacktestHandler) History(ctx context.Context, c *app.RequestContext) {
	strategyID := string(c.Query("strategy_id"))
	limit := 20
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	// Fetch one extra to determine if there's a next page.
	runs, err := h.store.ListBacktestRuns(ctx, strategyID, limit+1)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}

	items := make([]map[string]any, 0, limit)
	var nextCursor *string
	cut := len(runs)
	if cut > limit {
		cut = limit
		cur := historyCursor{CreatedAtUnix: runs[limit-1].CreatedAt.Unix()}
		if ptr, cerr := model.EncodeCursor(cur); cerr == nil {
			nextCursor = ptr
		}
	}
	for i := 0; i < cut; i++ {
		r := runs[i]
		entry := map[string]any{
			"id":         r.ID,
			"status":     string(mapStatus(r.Status)),
			"mode":       r.Mode,
			"created_at": r.CreatedAt.Unix(),
		}
		if r.StrategyID != nil {
			entry["strategy_id"] = *r.StrategyID
		}
		if r.FinishedAt != nil {
			entry["finished_at"] = r.FinishedAt.Unix()
		}
		items = append(items, entry)
	}
	RespondPaginated(c, items, nextCursor)
}
