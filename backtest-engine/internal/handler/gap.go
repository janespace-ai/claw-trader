package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

// GapHandler serves read-only gap info previously exposed by data-aggregator.
// It is intentionally read-only; gap repair is now automatically driven by
// the aggregator's boot pipeline.
type GapHandler struct {
	store *store.Store
}

// NewGapHandler constructs the handler.
func NewGapHandler(st *store.Store) *GapHandler {
	return &GapHandler{store: st}
}

// List handles GET /api/gaps?symbol=&interval=&status=&market=&limit=.
// Response shape is 1:1 compatible with the old data-aggregator endpoint.
func (h *GapHandler) List(ctx context.Context, c *app.RequestContext) {
	filter := store.GapFilter{
		Symbol:   string(c.Query("symbol")),
		Market:   string(c.Query("market")),
		Interval: string(c.Query("interval")),
		Status:   string(c.Query("status")),
	}
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			filter.Limit = n
		}
	}
	if filter.Market == "" {
		filter.Market = "futures"
	}
	gaps, err := h.store.QueryGaps(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gaps)
}
