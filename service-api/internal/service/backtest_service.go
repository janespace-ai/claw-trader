package service

import (
	"context"
	"encoding/json"
	stderrors "errors"
	"fmt"
	"log"
	"time"

	"github.com/janespace-ai/claw-trader/service-api/internal/aireview"
	"github.com/janespace-ai/claw-trader/service-api/internal/compliance"
	"github.com/janespace-ai/claw-trader/service-api/internal/config"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
	"github.com/janespace-ai/claw-trader/service-api/internal/sandboxclient"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// BacktestService owns the single-task lifecycle:
//
//	compliance (Gate 1) → AI review (Gate 2) → DB record → dispatch to sandbox-service
//
// "Dispatch" is now a single HTTP POST to sandbox-service — workers there
// pick up the job and stream progress / complete / error via the
// ``/internal/cb/...`` callbacks already handled by ``handler.CallbackHandler``.
// We no longer track a container ID or block on Monitor: the run row
// transitions via callbacks, and sandbox-service's own GC fails stuck jobs.
type BacktestService struct {
	cfg        config.Config
	store      *store.Store
	compliance *compliance.Checker
	aireview   *aireview.Service     // Gate 2; nil when disabled in config
	sbox       *sandboxclient.Client // dispatch target
}

// NewBacktestService wires the orchestrator.
//
// ``air`` may be nil — the service treats that as "Gate 2 is disabled" and
// goes straight from Gate 1 to the sandbox dispatch.  Useful for dev
// environments without a DeepSeek key.
func NewBacktestService(cfg config.Config, st *store.Store, cc *compliance.Checker, air *aireview.Service, sb *sandboxclient.Client) *BacktestService {
	return &BacktestService{
		cfg: cfg, store: st, compliance: cc, aireview: air, sbox: sb,
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

	// 1. Compliance check (Gate 1 — AST).
	verdict, err := s.compliance.Check(ctx, opts.Code)
	if err != nil {
		return "", fmt.Errorf("compliance check: %w", err)
	}
	if !verdict.OK {
		return "", &ComplianceError{Violations: verdict.Errors}
	}

	// 1b. AI review (Gate 2 — LLM).  Fail-closed: a reject or an unavailable
	// service both short-circuit BEFORE we write a backtest_runs row — we
	// don't want the runs table to fill up with rejected strategies.
	if s.aireview != nil && s.aireview.Enabled() {
		aiMode := opts.Mode
		if aiMode == model.ModeSingle {
			aiMode = "backtest"
		}
		aiVerdict, err := s.aireview.Review(ctx, opts.Code, aiMode, "" /* no runID yet */)
		if err != nil {
			if stderrors.Is(err, aireview.ErrUnavailable) {
				return "", &AIUnavailableError{}
			}
			// Any unexpected service-level error is treated as unavailable —
			// Review() itself converts model failures into reject verdicts,
			// so reaching here means we couldn't even get that far.
			return "", &AIUnavailableError{Cause: err.Error()}
		}
		if !aiVerdict.IsApproved() {
			return "", &AIRejectedError{
				Reason:     aiVerdict.Reason,
				Model:      aiVerdict.Model,
				Dimensions: aiVerdict.Dimensions,
			}
		}
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

	// 3. Dispatch to sandbox-service.  Synchronous POST — the service only
	// queues, so this returns in single-digit ms.  Any /run error fails the
	// run row immediately so the user sees the failure in the same request.
	if err := s.dispatch(ctx, runID, opts.Mode, opts.Code, opts.Config); err != nil {
		fin := time.Now().UTC()
		_ = s.store.UpdateBacktestStatus(ctx, runID, model.StatusFailed, nil, &fin,
			fmt.Sprintf("dispatch: %v", err))
		return "", fmt.Errorf("dispatch: %w", err)
	}
	// Flip to running as soon as the job is accepted — the worker will post
	// ``progress`` / ``complete`` / ``error`` callbacks from there.
	started := time.Now().UTC()
	_ = s.store.UpdateBacktestStatus(ctx, runID, model.StatusRunning, &started, nil, "")

	return runID, nil
}

// dispatch builds the sandbox-service /run request from a backtest Job.
//
// Kept in a helper so screener and backtest share the envelope shape without
// copy-paste; the only things that vary are ``mode`` and the per-mode
// ``config`` map.
func (s *BacktestService) dispatch(ctx context.Context, runID, mode, code string, cfg model.BacktestConfig) error {
	jobCfg := map[string]any{
		"symbols":               cfg.Symbols,
		"interval":              cfg.Interval,
		"from":                  cfg.From,
		"to":                    cfg.To,
		"initial_capital":       cfg.InitialCapital,
		"commission":            cfg.Commission,
		"slippage":              cfg.Slippage,
		"fill_mode":             cfg.FillMode,
		"max_optimization_runs": s.cfg.Backtest.MaxOptimizationRuns,
	}
	// Normalize sandbox-side mode: 'single' -> 'backtest', everything else stays.
	sandboxMode := mode
	if sandboxMode == model.ModeSingle {
		sandboxMode = "backtest"
	}

	_, err := s.sbox.Run(ctx, sandboxclient.RunRequest{
		JobID:           runID,
		TaskID:          runID,
		Mode:            sandboxMode,
		Code:            code,
		Config:          jobCfg,
		CallbackBaseURL: s.cfg.Sandbox.CallbackBase,
		DB: sandboxclient.DBCreds{
			Host:     s.cfg.Database.Host,
			Port:     s.cfg.Database.Port,
			User:     s.cfg.Readonly.User,
			Password: s.cfg.Readonly.Password,
			Name:     s.cfg.Database.Name,
		},
	})
	if err != nil {
		log.Printf("[backtest] dispatch failed run=%s: %v", runID, err)
		return err
	}
	log.Printf("[backtest] dispatched run=%s mode=%s", runID, sandboxMode)
	return nil
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

// AIRejectedError signals Gate 2 rejection.  The handler maps this to
// HTTP 403 + AI_REJECTED.  Reason / Dimensions / Model are surfaced to the
// user verbatim so they can see WHICH dimension tripped.
type AIRejectedError struct {
	Reason     string
	Model      string
	Dimensions map[string]string
}

func (e *AIRejectedError) Error() string {
	if e.Reason != "" {
		return "ai review rejected: " + e.Reason
	}
	return "ai review rejected"
}

// AIUnavailableError signals Gate 2 is required but the reviewer is not
// usable right now.  The handler maps this to HTTP 503 + AI_REVIEW_UNAVAILABLE.
// ``Cause`` is for ops logs only — it is NOT returned to the user, who gets
// a generic "please retry" message.
type AIUnavailableError struct {
	Cause string
}

func (e *AIUnavailableError) Error() string {
	if e.Cause != "" {
		return "ai review unavailable: " + e.Cause
	}
	return "ai review unavailable"
}
