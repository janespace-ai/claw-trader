package service

// RunningCount reports how many backtest runs are currently in flight.
// Used by `GET /api/engine/status`'s `active_tasks` field.
func (s *BacktestService) RunningCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.running)
}

// RunningCount for ScreenerService — screener jobs are not long-lived
// in-memory today (they complete via callback without a running-map),
// so this returns 0 as a pragmatic default. Kept for symmetry with
// BacktestService.RunningCount.
func (s *ScreenerService) RunningCount() int {
	return 0
}
