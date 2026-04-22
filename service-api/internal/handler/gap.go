package handler

import (
	"context"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// GapHandler serves read-only gap info previously exposed by
// data-aggregator. Gap repair is driven by the aggregator's boot
// pipeline; this endpoint is diagnostic only.
type GapHandler struct {
	store *store.Store
}

// NewGapHandler constructs the handler.
func NewGapHandler(st *store.Store) *GapHandler {
	return &GapHandler{store: st}
}

// List handles GET /api/gaps?symbol=&interval=&status=&market=&limit=.
// Response is a bare array (gaps list is small and unpaginated by design).
func (h *GapHandler) List(ctx context.Context, c *app.RequestContext) {
	filter := store.GapFilter{
		Symbol:   string(c.Query("symbol")),
		Market:   string(c.Query("market")),
		Interval: string(c.Query("interval")),
		Status:   string(c.Query("status")),
	}
	if filter.Interval != "" && !store.IsSupportedInterval(filter.Interval) {
		RespondError(c, apierr.New(apierr.CodeInvalidInterval, "unsupported interval").
			WithDetails(map[string]any{
				"interval":          filter.Interval,
				"allowed_intervals": store.SupportedIntervals,
			}))
		return
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
		RespondError(c, apierr.Wrap(err, apierr.CodeUpstreamUnreachable, err.Error()))
		return
	}
	RespondOK(c, gaps)
}
