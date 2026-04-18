package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/aggregator"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/fetcher"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/gap"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// SyncService orchestrates the full data pipeline and tracks a single running task.
type SyncService struct {
	cfg           config.Config
	store         *store.Store
	symbolService *SymbolService
	s3Fetcher     *fetcher.S3Fetcher
	apiFetcher    *fetcher.APIFetcher
	aggregator    *aggregator.Aggregator
	detector      *gap.Detector
	repairer      *gap.Repairer

	mu       sync.RWMutex
	current  *model.SyncTask // nil if idle
	lastDone *model.SyncTask // last finished task for status queries
}

// NewSyncService wires up all deps.
func NewSyncService(cfg config.Config, st *store.Store) *SyncService {
	symSvc := NewSymbolService(cfg.Gateio, cfg.Sync.TopSymbols, st)
	s3 := fetcher.NewS3Fetcher(cfg.Gateio, cfg.Sync, st)
	api := fetcher.NewAPIFetcher(cfg.Gateio, cfg.Sync, st)
	agg := aggregator.New(st)
	det := gap.NewDetector(cfg.Gap, st)
	rep := gap.NewRepairer(cfg.Gap, st, s3, api)

	return &SyncService{
		cfg:           cfg,
		store:         st,
		symbolService: symSvc,
		s3Fetcher:     s3,
		apiFetcher:    api,
		aggregator:    agg,
		detector:      det,
		repairer:      rep,
	}
}

// Start kicks off a background sync in the requested mode and returns the task id.
// Returns an error if another sync is already running.
func (s *SyncService) Start(mode model.SyncMode) (string, error) {
	s.mu.Lock()
	if s.current != nil && s.current.Status == model.SyncStatusRunning {
		s.mu.Unlock()
		return "", fmt.Errorf("sync already running: %s", s.current.TaskID)
	}

	taskID := newTaskID()
	task := &model.SyncTask{
		TaskID:    taskID,
		Mode:      mode,
		Status:    model.SyncStatusRunning,
		StartedAt: time.Now().UTC(),
	}
	s.current = task
	s.mu.Unlock()

	go s.run(task)

	return taskID, nil
}

// Status returns the current or most-recent task snapshot.
func (s *SyncService) Status() *model.SyncTask {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.current != nil {
		snapshot := *s.current
		snapshot.Progress.S3 = s.s3Fetcher.Progress()
		snapshot.Progress.API = s.apiFetcher.Progress()
		return &snapshot
	}
	if s.lastDone != nil {
		snapshot := *s.lastDone
		return &snapshot
	}
	return nil
}

// run executes the pipeline for the given task in the background.
func (s *SyncService) run(task *model.SyncTask) {
	ctx := context.Background()
	defer s.finish(task)

	switch task.Mode {
	case model.SyncModeFull:
		s.phaseSymbols(ctx, task)
		s.phaseS3(ctx, task)
		s.phaseAggregate(ctx, task)
		s.phaseAPI(ctx, task)
		s.phaseGap(ctx, task)
	case model.SyncModeS3:
		s.phaseSymbols(ctx, task)
		s.phaseS3(ctx, task)
		s.phaseAggregate(ctx, task)
	case model.SyncModeAPI:
		s.phaseAPI(ctx, task)
	case model.SyncModeRepair:
		s.phaseGap(ctx, task)
	default:
		task.Error = fmt.Sprintf("unknown mode %q", task.Mode)
	}
}

func (s *SyncService) phaseSymbols(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "symbols"
	s.mu.Unlock()
	if _, err := s.symbolService.Refresh(ctx); err != nil {
		s.setError(task, fmt.Sprintf("refresh symbols: %v", err))
	}
}

func (s *SyncService) phaseS3(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "s3_download"
	s.mu.Unlock()

	symbols, err := s.store.ActiveSymbols(ctx, "futures", 0)
	if err != nil {
		s.setError(task, fmt.Sprintf("list active symbols: %v", err))
		return
	}
	names := make([]string, 0, len(symbols))
	for _, sym := range symbols {
		names = append(names, sym.Symbol)
	}
	if err := s.s3Fetcher.Run(ctx, names); err != nil {
		s.setError(task, fmt.Sprintf("s3 fetch: %v", err))
	}
}

func (s *SyncService) phaseAggregate(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "aggregate"
	s.mu.Unlock()

	if err := s.aggregator.AggregateAll(ctx); err != nil {
		s.setError(task, fmt.Sprintf("aggregate: %v", err))
	}
}

func (s *SyncService) phaseAPI(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "api_fill"
	s.mu.Unlock()

	symbols, err := s.store.ActiveSymbols(ctx, "futures", 0)
	if err != nil {
		s.setError(task, fmt.Sprintf("list active symbols: %v", err))
		return
	}
	names := make([]string, 0, len(symbols))
	for _, sym := range symbols {
		names = append(names, sym.Symbol)
	}
	if err := s.apiFetcher.FillAll(ctx, names); err != nil {
		s.setError(task, fmt.Sprintf("api fill: %v", err))
	}
}

func (s *SyncService) phaseGap(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "gap_repair"
	s.mu.Unlock()

	now := time.Now().UTC()
	from := now.AddDate(0, -s.cfg.Sync.MonthsBack, 0)
	intervals := []string{"5m", "1h", "4h", "1d"}

	if _, err := s.detector.DetectAll(ctx, intervals, from, now); err != nil {
		s.setError(task, fmt.Sprintf("detect gaps: %v", err))
		return
	}

	repaired, skipped, err := s.repairer.RepairAll(ctx)
	if err != nil {
		s.setError(task, fmt.Sprintf("repair gaps: %v", err))
		return
	}
	log.Printf("[sync] gaps repaired=%d skipped=%d", repaired, skipped)
}

// setError appends an error to the running task under lock. Best-effort, does not abort.
func (s *SyncService) setError(task *model.SyncTask, msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if task.Error == "" {
		task.Error = msg
	} else {
		task.Error = task.Error + "; " + msg
	}
	log.Printf("[sync] error: %s", msg)
}

// finish transitions the task to a terminal status and moves it to lastDone.
func (s *SyncService) finish(task *model.SyncTask) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	task.FinishedAt = &now
	if task.Error != "" {
		task.Status = model.SyncStatusFailed
	} else {
		task.Status = model.SyncStatusDone
	}
	task.Progress.Phase = "done"

	// Capture final fetcher progress into the task snapshot so /api/sync/status
	// keeps reporting the real terminal counts after the task moves to lastDone
	// (the fetchers themselves reset their live counters between runs).
	task.Progress.S3 = s.s3Fetcher.Progress()
	task.Progress.API = s.apiFetcher.Progress()

	log.Printf("[sync] task %s finished status=%s duration=%s s3=%d/%d api=%d/%d",
		task.TaskID, task.Status, now.Sub(task.StartedAt),
		task.Progress.S3.Done, task.Progress.S3.Total,
		task.Progress.API.Done, task.Progress.API.Total)

	s.lastDone = task
	s.current = nil
}

func newTaskID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
