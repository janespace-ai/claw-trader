package handler

import (
	"context"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// StrategyVersionsHandler serves the /api/strategies/:id/versions tree.
type StrategyVersionsHandler struct {
	store *store.Store
}

// NewStrategyVersionsHandler constructs the handler.
func NewStrategyVersionsHandler(st *store.Store) *StrategyVersionsHandler {
	return &StrategyVersionsHandler{store: st}
}

// List handles GET /api/strategies/:id/versions?limit=&cursor=.
func (h *StrategyVersionsHandler) List(ctx context.Context, c *app.RequestContext) {
	strategyID := c.Param("id")
	limit := 50
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	vs, err := h.store.ListStrategyVersions(ctx, strategyID, limit+1)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	// next_cursor semantics: emit when we got more than `limit` rows.
	var nextCursor *string
	cut := len(vs)
	if cut > limit {
		cut = limit
		if ptr, cerr := model.EncodeCursor(map[string]any{"offset": limit}); cerr == nil {
			nextCursor = ptr
		}
	}
	RespondPaginated(c, vs[:cut], nextCursor)
}

// Get handles GET /api/strategies/:id/versions/:version.
func (h *StrategyVersionsHandler) Get(ctx context.Context, c *app.RequestContext) {
	strategyID := c.Param("id")
	versionStr := c.Param("version")
	version, err := strconv.Atoi(versionStr)
	if err != nil || version <= 0 {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "version must be a positive integer"))
		return
	}
	v, ok, err := h.store.GetStrategyVersion(ctx, strategyID, version)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeStrategyVersionNotFound,
			"strategy version not found").WithDetails(map[string]any{
			"strategy_id": strategyID,
			"version":     version,
		}))
		return
	}
	RespondOK(c, v)
}

type createVersionReq struct {
	Code          string         `json:"code"`
	Summary       string         `json:"summary"`
	ParamsSchema  map[string]any `json:"params_schema,omitempty"`
	ParentVersion *int           `json:"parent_version,omitempty"`
}

// Create handles POST /api/strategies/:id/versions.
func (h *StrategyVersionsHandler) Create(ctx context.Context, c *app.RequestContext) {
	strategyID := c.Param("id")
	var req createVersionReq
	if err := c.BindJSON(&req); err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeInvalidRange, "bind request: "+err.Error()))
		return
	}
	if req.Code == "" {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "code is required"))
		return
	}
	v, err := h.store.CreateStrategyVersion(ctx, strategyID, req.Code, req.Summary, req.ParamsSchema, req.ParentVersion)
	if err != nil {
		// Interpret "no rows" / "parent_version N not found" as typed 404s.
		msg := err.Error()
		if containsAny(msg, "no rows") {
			RespondError(c, apierr.New(apierr.CodeStrategyNotFound, "strategy not found").
				WithDetails(map[string]any{"strategy_id": strategyID}))
			return
		}
		if containsAny(msg, "parent_version") {
			RespondError(c, apierr.New(apierr.CodeStrategyVersionNotFound, msg).
				WithDetails(map[string]any{
					"strategy_id":    strategyID,
					"parent_version": req.ParentVersion,
				}))
			return
		}
		RespondError(c, apierr.Wrap(err, apierr.CodeInternalError, msg))
		return
	}
	RespondOK(c, v)
}

// containsAny is a tiny strings.Contains helper without importing
// strings just for this. Keeps this file dependency-light.
func containsAny(s string, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
