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

// RunBoot kicks off the boot-time sync pipeline and returns immediately.
// The pipeline runs in a background goroutine so callers (typically main.go
// after DB + migrations are ready) can proceed without blocking on S3 / API
// work that may take hours on a cold start.
//
// If a pipeline is already running (e.g. two RunBoot calls in quick succession),
// the second call is a no-op and the existing task id is returned.
func (s *SyncService) RunBoot(ctx context.Context) string {
	s.mu.Lock()
	if s.current != nil && s.current.Status == model.SyncStatusRunning {
		existing := s.current.TaskID
		s.mu.Unlock()
		log.Printf("[sync] RunBoot: pipeline already running task=%s, skipping", existing)
		return existing
	}

	taskID := newTaskID()
	task := &model.SyncTask{
		TaskID:    taskID,
		Mode:      model.SyncModeFull,
		Status:    model.SyncStatusRunning,
		StartedAt: time.Now().UTC(),
	}
	s.current = task
	s.mu.Unlock()

	log.Printf("[sync] RunBoot: starting boot pipeline task=%s", taskID)
	go s.runWithContext(ctx, task)
	return taskID
}

// RunBootSync is the synchronous variant of RunBoot — it runs the full
// pipeline on the calling goroutine and returns only after all phases
// have completed (or errored). Tests use this to assert outcomes
// deterministically without polling. Production code should stay on
// RunBoot so /healthz is not blocked by cold-start downloads.
//
// Returns the completed task snapshot; task.Error is set if any phase
// reported a problem but the pipeline still ran to the end.
func (s *SyncService) RunBootSync(ctx context.Context) *model.SyncTask {
	s.mu.Lock()
	taskID := newTaskID()
	task := &model.SyncTask{
		TaskID:    taskID,
		Mode:      model.SyncModeFull,
		Status:    model.SyncStatusRunning,
		StartedAt: time.Now().UTC(),
	}
	s.current = task
	s.mu.Unlock()

	s.runWithContext(ctx, task)
	return task
}

// runWithContext executes the detect-first boot pipeline using the provided context.
// Order: refresh symbols → pre-detect (visibility only) → S3 backfill → aggregate →
// API fill → detect → repair. The S3 and API fetchers are already incremental
// (S3 skips months marked done in sync_state; API resumes from LatestTimestamp),
// so re-runs after a crash only touch data that is actually missing.
func (s *SyncService) runWithContext(ctx context.Context, task *model.SyncTask) {
	defer s.finish(task)
	s.phaseSymbols(ctx, task)
	s.phasePreDetect(ctx, task)
	s.phaseS3(ctx, task)
	s.phaseAggregate(ctx, task)
	s.phaseAPI(ctx, task)
	s.phaseGap(ctx, task)
}

func (s *SyncService) phaseSymbols(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "symbols"
	s.mu.Unlock()
	log.Printf("[sync] phase=symbols task=%s refreshing top-%d", task.TaskID, s.cfg.Sync.TopSymbols)
	syms, err := s.symbolService.Refresh(ctx)
	if err != nil {
		s.setError(task, fmt.Sprintf("refresh symbols: %v", err))
		return
	}
	log.Printf("[sync] phase=symbols task=%s done symbol_count=%d", task.TaskID, len(syms))
}

// phasePreDetect runs gap detection BEFORE any downloads so the logs show
// exactly how much work the boot pipeline is about to do. The S3 and API
// fetchers still self-filter using sync_state / LatestTimestamp, so this phase
// is informational; it does not gate subsequent phases. This is the "detect-first"
// checkpoint of the boot pipeline.
func (s *SyncService) phasePreDetect(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "pre_detect"
	s.mu.Unlock()

	now := time.Now().UTC()
	from := now.AddDate(0, -s.cfg.Sync.MonthsBack, 0)
	intervals := []string{"5m", "1h", "4h", "1d"}
	log.Printf("[sync] phase=pre_detect task=%s scanning from=%s intervals=%v",
		task.TaskID, from.Format("2006-01-02"), intervals)

	reports, err := s.detector.DetectAll(ctx, intervals, from, now)
	if err != nil {
		// Non-fatal: log and continue, downstream phases still work.
		log.Printf("[sync] phase=pre_detect task=%s warn: %v", task.TaskID, err)
		return
	}
	var totalGaps int
	var totalMissing int
	for _, r := range reports {
		totalGaps += len(r.Gaps)
		for _, g := range r.Gaps {
			totalMissing += g.MissingBars
		}
	}
	log.Printf("[sync] phase=pre_detect task=%s done reports=%d gap_count=%d missing_bars=%d",
		task.TaskID, len(reports), totalGaps, totalMissing)
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
	log.Printf("[sync] phase=s3_download task=%s symbol_count=%d months_back=%d",
		task.TaskID, len(names), s.cfg.Sync.MonthsBack)
	if err := s.s3Fetcher.Run(ctx, names); err != nil {
		s.setError(task, fmt.Sprintf("s3 fetch: %v", err))
		return
	}
	p := s.s3Fetcher.Progress()
	log.Printf("[sync] phase=s3_download task=%s done ok=%d failed=%d total=%d",
		task.TaskID, p.Done, p.Failed, p.Total)
}

func (s *SyncService) phaseAggregate(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "aggregate"
	s.mu.Unlock()
	log.Printf("[sync] phase=aggregate task=%s starting", task.TaskID)
	if err := s.aggregator.AggregateAll(ctx); err != nil {
		s.setError(task, fmt.Sprintf("aggregate: %v", err))
		return
	}
	log.Printf("[sync] phase=aggregate task=%s done", task.TaskID)
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
	log.Printf("[sync] phase=api_fill task=%s symbol_count=%d", task.TaskID, len(names))
	if err := s.apiFetcher.FillAll(ctx, names); err != nil {
		s.setError(task, fmt.Sprintf("api fill: %v", err))
		return
	}
	p := s.apiFetcher.Progress()
	log.Printf("[sync] phase=api_fill task=%s done ok=%d failed=%d total=%d",
		task.TaskID, p.Done, p.Failed, p.Total)
}

func (s *SyncService) phaseGap(ctx context.Context, task *model.SyncTask) {
	s.mu.Lock()
	task.Progress.Phase = "gap_repair"
	s.mu.Unlock()

	now := time.Now().UTC()
	from := now.AddDate(0, -s.cfg.Sync.MonthsBack, 0)
	intervals := []string{"5m", "1h", "4h", "1d"}
	log.Printf("[sync] phase=gap_repair task=%s detect intervals=%v", task.TaskID, intervals)

	reports, err := s.detector.DetectAll(ctx, intervals, from, now)
	if err != nil {
		s.setError(task, fmt.Sprintf("detect gaps: %v", err))
		return
	}
	var remainingGaps int
	for _, r := range reports {
		remainingGaps += len(r.Gaps)
	}
	log.Printf("[sync] phase=gap_repair task=%s detect_done remaining_gaps=%d", task.TaskID, remainingGaps)

	repaired, skipped, err := s.repairer.RepairAll(ctx)
	if err != nil {
		s.setError(task, fmt.Sprintf("repair gaps: %v", err))
		return
	}
	log.Printf("[sync] phase=gap_repair task=%s done repaired=%d skipped=%d", task.TaskID, repaired, skipped)
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
