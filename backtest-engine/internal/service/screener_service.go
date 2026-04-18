package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/config"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/compliance"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/sandbox"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

// ScreenerService orchestrates screener (filter) jobs — same sandbox mechanics as BacktestService
// but with a different mode and Config shape.
type ScreenerService struct {
	cfg        config.Config
	store      *store.Store
	compliance *compliance.Checker
	sandbox    *sandbox.Manager
}

// NewScreenerService wires the screener orchestrator.
func NewScreenerService(cfg config.Config, st *store.Store, cc *compliance.Checker, sm *sandbox.Manager) *ScreenerService {
	return &ScreenerService{cfg: cfg, store: st, compliance: cc, sandbox: sm}
}

// Submit enqueues a screener run.
func (s *ScreenerService) Submit(ctx context.Context, code string, cfg model.ScreenerConfig, strategyID *string) (string, error) {
	verdict, err := s.compliance.Check(ctx, code)
	if err != nil {
		return "", fmt.Errorf("compliance: %w", err)
	}
	if !verdict.OK {
		return "", &ComplianceError{Violations: verdict.Errors}
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

	go s.launch(runID, code, cfg)
	return runID, nil
}

func (s *ScreenerService) launch(runID, code string, cfg model.ScreenerConfig) {
	bg := context.Background()
	started := time.Now().UTC()
	_ = s.store.UpdateScreenerStatus(bg, runID, model.StatusRunning, &started, nil, "")

	jobCfg := map[string]any{
		"market":        cfg.Market,
		"lookback_days": cfg.LookbackDays,
	}

	job := sandbox.Job{
		TaskID:      runID,
		Mode:        "screener",
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

	cid, err := s.sandbox.Launch(bg, sandbox.LaunchParams{TaskID: runID, Job: job})
	if err != nil {
		fin := time.Now().UTC()
		_ = s.store.UpdateScreenerStatus(bg, runID, model.StatusFailed, nil, &fin,
			fmt.Sprintf("launch: %v", err))
		return
	}

	exitCode, waitErr := s.sandbox.Monitor(bg, cid)
	if waitErr != nil {
		fin := time.Now().UTC()
		_ = s.store.UpdateScreenerStatus(bg, runID, model.StatusFailed, nil, &fin,
			fmt.Sprintf("sandbox: %v", waitErr))
	} else if exitCode != 0 {
		logs, _ := s.sandbox.Logs(bg, cid, 200)
		log.Printf("[screener] run=%s exit=%d logs=%s", runID, exitCode, truncate(logs, 1000))
	}

	_ = s.sandbox.Cleanup(bg, cid)
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
