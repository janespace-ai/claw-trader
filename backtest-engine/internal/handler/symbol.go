package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

// SymbolHandler serves the active symbol list previously exposed by
// data-aggregator. It reads directly from the shared `claw.symbols` table.
type SymbolHandler struct {
	store *store.Store
}

// NewSymbolHandler constructs the handler.
func NewSymbolHandler(st *store.Store) *SymbolHandler {
	return &SymbolHandler{store: st}
}

// List handles GET /api/symbols?market=futures&limit=300. Response shape is
// 1:1 compatible with the old data-aggregator endpoint.
func (h *SymbolHandler) List(ctx context.Context, c *app.RequestContext) {
	market := string(c.Query("market"))
	if market == "" {
		market = "futures"
	}
	limit := 300
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	symbols, err := h.store.ListActiveSymbols(ctx, market, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, symbols)
}
