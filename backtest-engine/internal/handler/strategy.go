package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
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
		c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Name == "" || req.Code == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "name and code are required"})
		return
	}
	if req.CodeType != model.CodeTypeStrategy && req.CodeType != model.CodeTypeScreener {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "code_type must be 'strategy' or 'screener'"})
		return
	}

	id, err := h.store.CreateStrategy(ctx, model.Strategy{
		Name: req.Name, CodeType: req.CodeType,
		Code: req.Code, ParamsSchema: req.ParamsSchema,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, map[string]any{"id": id, "name": req.Name})
}

// List handles GET /api/strategies?type=&limit=.
func (h *StrategyHandler) List(ctx context.Context, c *app.RequestContext) {
	codeType := string(c.Query("type"))
	limit := 50
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	list, err := h.store.ListStrategies(ctx, codeType, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// Get handles GET /api/strategies/:id.
func (h *StrategyHandler) Get(ctx context.Context, c *app.RequestContext) {
	id := c.Param("id")
	st, ok, err := h.store.GetStrategy(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if !ok {
		c.JSON(http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	c.JSON(http.StatusOK, st)
}
