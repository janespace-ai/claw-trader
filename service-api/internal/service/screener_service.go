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

// ScreenerService orchestrates screener (filter) jobs — same sandbox dispatch
// as BacktestService but with a different mode and a slimmer Config shape.
type ScreenerService struct {
	cfg        config.Config
	store      *store.Store
	compliance *compliance.Checker
	aireview   *aireview.Service     // Gate 2; nil when disabled
	sbox       *sandboxclient.Client // dispatch target
}

// NewScreenerService wires the screener orchestrator.  ``air`` may be nil.
func NewScreenerService(cfg config.Config, st *store.Store, cc *compliance.Checker, air *aireview.Service, sb *sandboxclient.Client) *ScreenerService {
	return &ScreenerService{cfg: cfg, store: st, compliance: cc, aireview: air, sbox: sb}
}

// Submit enqueues a screener run.
func (s *ScreenerService) Submit(ctx context.Context, code string, cfg model.ScreenerConfig, strategyID *string) (string, error) {
	// Gate 1 — AST compliance.
	verdict, err := s.compliance.Check(ctx, code)
	if err != nil {
		return "", fmt.Errorf("compliance: %w", err)
	}
	if !verdict.OK {
		return "", &ComplianceError{Violations: verdict.Errors}
	}

	// Gate 2 — AI review.  Symmetric to BacktestService; rejects short-circuit
	// BEFORE we write a screener_runs row.
	if s.aireview != nil && s.aireview.Enabled() {
		aiVerdict, err := s.aireview.Review(ctx, code, "screener", "")
		if err != nil {
			if stderrors.Is(err, aireview.ErrUnavailable) {
				return "", &AIUnavailableError{}
			}
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

	cfgBytes, err := json.Marshal(cfg)
	if err != nil {
		return "", fmt.Errorf("marshal config: %w", err)
	}
	runID, err := s.store.CreateScreenerRun(ctx, model.ScreenerRun{
		StrategyID: strategyID,
		Status:     model.StatusPending,
		Config:     cfgBytes,
	})
	if err != nil {
		return "", fmt.Errorf("create run: %w", err)
	}

	if err := s.dispatch(ctx, runID, code, cfg); err != nil {
		fin := time.Now().UTC()
		_ = s.store.UpdateScreenerStatus(ctx, runID, model.StatusFailed, nil, &fin,
			fmt.Sprintf("dispatch: %v", err))
		return "", fmt.Errorf("dispatch: %w", err)
	}
	started := time.Now().UTC()
	_ = s.store.UpdateScreenerStatus(ctx, runID, model.StatusRunning, &started, nil, "")

	return runID, nil
}

func (s *ScreenerService) dispatch(ctx context.Context, runID, code string, cfg model.ScreenerConfig) error {
	jobCfg := map[string]any{
		"market":        cfg.Market,
		"lookback_days": cfg.LookbackDays,
	}
	_, err := s.sbox.Run(ctx, sandboxclient.RunRequest{
		JobID:           runID,
		TaskID:          runID,
		Mode:            "screener",
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
		log.Printf("[screener] dispatch failed run=%s: %v", runID, err)
		return err
	}
	log.Printf("[screener] dispatched run=%s", runID)
	return nil
}

// HandleComplete writes screener result and marks done.
func (s *ScreenerService) HandleComplete(ctx context.Context, taskID string, result any) error {
	return s.store.UpdateScreenerResult(ctx, taskID, result)
}

// HandleError marks a screener run failed.
func (s *ScreenerService) HandleError(ctx context.Context, taskID, errMsg string) error {
	fin := time.Now().UTC()
	return s.store.UpdateScreenerStatus(ctx, taskID, model.StatusFailed, nil, &fin, errMsg)
}
