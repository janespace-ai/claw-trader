package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/compliance"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/config"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/sandbox"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

// BacktestService owns the single-task lifecycle: compliance -> DB record -> launch sandbox.
type BacktestService struct {
	cfg       config.Config
	store     *store.Store
	compliance *compliance.Checker
	sandbox   *sandbox.Manager

	mu        sync.Mutex
	running   map[string]string // task_id -> container_id
}

// NewBacktestService wires the orchestrator.
func NewBacktestService(cfg config.Config, st *store.Store, cc *compliance.Checker, sm *sandbox.Manager) *BacktestService {
	return &BacktestService{
		cfg: cfg, store: st, compliance: cc, sandbox: sm,
		running: map[string]string{},
	}
}

// SubmitBacktest validates the code, creates a run row, and launches a sandbox.
// Returns the task (run) ID or an error with a reason string.
type SubmitOptions struct {
	Code       string
	Config     model.BacktestConfig
	StrategyID *string
	Mode       string // 'single' | 'optimization'
}

// SubmitBacktest is the unified entry for both regular backtest and optimization.
func (s *BacktestService) SubmitBacktest(ctx context.Context, opts SubmitOptions) (string, error) {
	// Gate on single-in-flight (MVP constraint).
	running, existingID, err := s.store.HasRunningBacktest(ctx)
	if err != nil {
		return "", fmt.Errorf("check running: %w", err)
	}
	if running {
		return "", fmt.Errorf("another backtest is running: %s", existingID)
	}

	// 1. Compliance check.
	verdict, err := s.compliance.Check(ctx, opts.Code)
	if err != nil {
		return "", fmt.Errorf("compliance check: %w", err)
	}
	if !verdict.OK {
		return "", &ComplianceError{Violations: verdict.Errors}
	}

	// 2. Persist pending run record.
	cfgBytes, err := json.Marshal(opts.Config)
	if err != nil {
		return "", fmt.Errorf("marshal config: %w", err)
	}
	runID, err := s.store.CreateBacktestRun(ctx, model.BacktestRun{
		StrategyID: opts.StrategyID,
		Status:     model.StatusPending,
		Mode:       opts.Mode,
		Config:     cfgBytes,
	})
	if err != nil {
		return "", fmt.Errorf("create run: %w", err)
	}

	// 3. Launch sandbox asynchronously. We detach from the request ctx.
	go s.launchSandbox(runID, opts.Mode, opts.Code, opts.Config)

	return runID, nil
}

// launchSandbox handles the out-of-request lifecycle of a backtest container.
func (s *BacktestService) launchSandbox(runID, mode, code string, cfg model.BacktestConfig) {
	bg := context.Background()
	started := time.Now().UTC()
	_ = s.store.UpdateBacktestStatus(bg, runID, model.StatusRunning, &started, nil, "")

	jobCfg := map[string]any{
		"symbols":         cfg.Symbols,
		"interval":        cfg.Interval,
		"from":            cfg.From,
		"to":              cfg.To,
		"initial_capital": cfg.InitialCapital,
		"commission":      cfg.Commission,
		"slippage":        cfg.Slippage,
		"fill_mode":       cfg.FillMode,
		"max_optimization_runs": s.cfg.Backtest.MaxOptimizationRuns,
	}

	job := sandbox.Job{
		TaskID:      runID,
		Mode:        mode, // 'single' or 'optimization' — translates to 'backtest' or 'optimization' runner modes
		Code:        code,
		Config:      jobCfg,
		CallbackURL: s.cfg.Sandbox.CallbackBase,
		DB: sandbox.DBInfo{
			Host:     s.cfg.Database.Host,
			Port:     s.cfg.Database.Port,
			User:     s.cfg.Readonly.User,
			Password: s.cfg.Readonly.Password,
			Name:     s.cfg.Database.Name,
		},
	}
	// Normalize sandbox-side mode: 'single' -> 'backtest', everything else stays.
	if job.Mode == model.ModeSingle {
		job.Mode = "backtest"
	}

	cid, err := s.sandbox.Launch(bg, sandbox.LaunchParams{TaskID: runID, Job: job})
	if err != nil {
		fin := time.Now().UTC()
		_ = s.store.UpdateBacktestStatus(bg, runID, model.StatusFailed, nil, &fin,
			fmt.Sprintf("launch sandbox: %v", err))
		return
	}

	s.mu.Lock()
	s.running[runID] = cid
	s.mu.Unlock()

	// Wait for the container to exit (or timeout).
	exitCode, waitErr := s.sandbox.Monitor(bg, cid)
	if waitErr != nil {
		fin := time.Now().UTC()
		_ = s.store.UpdateBacktestStatus(bg, runID, model.StatusFailed, nil, &fin,
			fmt.Sprintf("sandbox: %v", waitErr))
	} else if exitCode != 0 {
		// The runner.py should have already POSTed an error callback, but we still
		// record the non-zero exit in case it failed before the callback.
		logs, _ := s.sandbox.Logs(bg, cid, 200)
		log.Printf("[backtest] run=%s exit=%d logs=%s", runID, exitCode, truncate(logs, 1000))
	}

	s.mu.Lock()
	delete(s.running, runID)
	s.mu.Unlock()

	_ = s.sandbox.Cleanup(bg, cid)
}

// HandleProgress merges a progress update from a sandbox callback.
func (s *BacktestService) HandleProgress(ctx context.Context, taskID string, payload any) error {
	return s.store.UpdateBacktestProgress(ctx, taskID, payload)
}

// HandleComplete writes the final result and marks the run done.
func (s *BacktestService) HandleComplete(ctx context.Context, taskID string, result any) error {
	return s.store.UpdateBacktestResult(ctx, taskID, result)
}

// HandleError marks a run failed with the error message from the sandbox.
func (s *BacktestService) HandleError(ctx context.Context, taskID, errMsg string) error {
	fin := time.Now().UTC()
	return s.store.UpdateBacktestStatus(ctx, taskID, model.StatusFailed, nil, &fin, errMsg)
}

// ComplianceError is returned when AST checking rejects submitted code.
type ComplianceError struct {
	Violations []compliance.Violation
}

func (e *ComplianceError) Error() string {
	if len(e.Violations) == 0 {
		return "compliance failed"
	}
	v := e.Violations[0]
	return fmt.Sprintf("%s (line %d): %s", v.Rule, v.Line, v.Message)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
