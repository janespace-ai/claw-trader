package handler

import (
	"context"
	"time"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/service"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
	"github.com/janespace-ai/claw-trader/service-api/internal/version"
)

// EngineStatusHandler powers `GET /api/engine/status`. Returns build
// + data + activity metadata for the Settings screen's Remote Engine
// card.
type EngineStatusHandler struct {
	store *store.Store
	bs    *service.BacktestService
	ss    *service.ScreenerService
}

// NewEngineStatusHandler constructs the handler.
func NewEngineStatusHandler(st *store.Store, bs *service.BacktestService, ss *service.ScreenerService) *EngineStatusHandler {
	return &EngineStatusHandler{store: st, bs: bs, ss: ss}
}

// Get handles GET /api/engine/status.
func (h *EngineStatusHandler) Get(ctx context.Context, c *app.RequestContext) {
	from, to, err := h.store.DataRange(ctx)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeUpstreamUnreachable, err.Error()))
		return
	}
	lastSync, err := h.store.LastAggregatorSync(ctx)
	if err != nil {
		// Non-fatal: continue with nil.
		lastSync = nil
	}
	active := h.bs.RunningCount() + h.ss.RunningCount()

	resp := map[string]any{
		"version":                 version.Version,
		"supported_markets":       []string{"futures"},
		"supported_intervals":     store.SupportedIntervals,
		"active_tasks":            active,
		"uptime_seconds":          time.Now().Unix() - version.ProcessStartUnix,
	}
	if !from.IsZero() && !to.IsZero() {
		resp["data_range"] = map[string]any{
			"from": from.Unix(),
			"to":   to.Unix(),
		}
	} else {
		resp["data_range"] = nil
	}
	if lastSync != nil {
		resp["last_aggregator_sync_at"] = lastSync.Unix()
	} else {
		resp["last_aggregator_sync_at"] = nil
	}
	RespondOK(c, resp)
}
