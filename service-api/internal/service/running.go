package service

import (
	"context"
	"time"
)

// RunningCount reports how many backtest runs are currently in flight.
// Used by `GET /api/engine/status`'s `active_tasks` field.
//
// Post-sandbox-service: we no longer track in-flight jobs in process memory
// (the old ``sandbox.Manager`` had a ``running map[runID]containerID``).
// The runs table is now the single source of truth — a quick COUNT with a
// short timeout is cheap enough.  On DB error we return 0 rather than
// blocking the status endpoint.
func (s *BacktestService) RunningCount() int {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	n, err := s.store.CountRunningBacktests(ctx)
	if err != nil {
		return 0
	}
	return n
}

// RunningCount for ScreenerService — screener jobs are not long-lived
// in-memory today (they complete via callback without a running-map),
// so this returns 0 as a pragmatic default. Kept for symmetry with
// BacktestService.RunningCount.
func (s *ScreenerService) RunningCount() int {
	return 0
}
