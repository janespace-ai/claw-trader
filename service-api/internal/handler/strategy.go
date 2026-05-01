package handler

import (
	"context"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// StrategyHandler handles saved strategy CRUD.
type StrategyHandler struct {
	store *store.Store
}

// NewStrategyHandler constructs the handler.
func NewStrategyHandler(st *store.Store) *StrategyHandler {
	return &StrategyHandler{store: st}
}

type createStrategyReq struct {
	Name         string         `json:"name"`
	CodeType     string         `json:"code_type"`
	Code         string         `json:"code"`
	ParamsSchema map[string]any `json:"params_schema,omitempty"`
}

// Create handles POST /api/strategies.
func (h *StrategyHandler) Create(ctx context.Context, c *app.RequestContext) {
	var req createStrategyReq
	if err := c.BindJSON(&req); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInvalidRange, "bind request: "+err.Error()))
		return
	}
	if req.Name == "" || req.Code == "" {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "name and code are required"))
		return
	}
	if req.CodeType != model.CodeTypeStrategy && req.CodeType != model.CodeTypeScreener {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "code_type must be 'strategy' or 'screener'"))
		return
	}

	id, err := h.store.CreateStrategy(ctx, model.Strategy{
		Name: req.Name, CodeType: req.CodeType,
		Code: req.Code, ParamsSchema: req.ParamsSchema,
	})
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	RespondOK(c, map[string]any{"id": id, "name": req.Name})
}

// List handles GET /api/strategies?code_type=&limit=&cursor=. Returns
// a canonical Paginated<Strategy>.
func (h *StrategyHandler) List(ctx context.Context, c *app.RequestContext) {
	codeType := string(c.Query("code_type"))
	if codeType == "" {
		codeType = string(c.Query("type"))
	}
	limit := 50
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	// Fetch one extra to detect "next page exists". `cursor` isn't
	// decoded today — the store doesn't support it yet — but we emit
	// a `next_cursor` when the page is full so clients can paginate
	// once the store gains cursor support without an API break.
	list, err := h.store.ListStrategies(ctx, codeType, limit+1)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	var nextCursor *string
	cut := len(list)
	if cut > limit {
		cut = limit
		if ptr, cerr := model.EncodeCursor(map[string]any{"offset": limit}); cerr == nil {
			nextCursor = ptr
		}
	}
	RespondPaginated(c, list[:cut], nextCursor)
}

// Get handles GET /api/strategies/:id.
func (h *StrategyHandler) Get(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	st, ok, err := h.store.GetStrategy(ctx, id)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeStrategyNotFound, "strategy not found").
			WithDetails(map[string]any{"strategy_id": id}))
		return
	}
	RespondOK(c, st)
}

// patchDraftReq is the body for PATCH /api/strategies/:id (workspace
// fields only — does NOT touch saved_*).  Pointer fields so callers can
// update a single column without disturbing the others.
type patchDraftReq struct {
	DraftCode    *string                    `json:"draft_code,omitempty"`
	DraftSymbols *[]string                  `json:"draft_symbols,omitempty"`
	LastBacktest *model.LastBacktestSummary `json:"last_backtest,omitempty"`
}

// PatchDraft handles PATCH /api/strategies/:id.  Updates workspace-zone
// fields only; `saved_*` requires the explicit Save endpoint.
func (h *StrategyHandler) PatchDraft(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	var req patchDraftReq
	if err := c.BindJSON(&req); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInvalidRange, "bind request: "+err.Error()))
		return
	}
	if err := h.store.PatchStrategyDraft(ctx, id, req.DraftCode, req.DraftSymbols, req.LastBacktest); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	st, ok, err := h.store.GetStrategy(ctx, id)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeStrategyNotFound, "strategy not found"))
		return
	}
	RespondOK(c, st)
}

// saveStrategyReq is the body for POST /api/strategies/:id/save.  `Name`
// is optional — sent on the FIRST save (when the strategy was created
// with name=null and the user just typed one in the save dialog).
type saveStrategyReq struct {
	Name *string `json:"name,omitempty"`
}

// Save handles POST /api/strategies/:id/save.  Snapshots draft → saved.
func (h *StrategyHandler) Save(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	var req saveStrategyReq
	// body is optional (no name change); ignore bind errors gracefully.
	_ = c.BindJSON(&req)
	if err := h.store.SaveStrategy(ctx, id, req.Name); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	st, ok, err := h.store.GetStrategy(ctx, id)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeStrategyNotFound, "strategy not found"))
		return
	}
	RespondOK(c, st)
}

// ArchiveDraft handles POST /api/strategies/:id/archive_draft.
func (h *StrategyHandler) ArchiveDraft(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	if err := h.store.ArchiveStrategyDraft(ctx, id); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	RespondOK(c, map[string]any{"id": id, "is_archived_draft": true})
}
