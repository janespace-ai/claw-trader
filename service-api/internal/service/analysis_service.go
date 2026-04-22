// Package service: AnalysisService owns OptimLens / SignalReview /
// TradeExplain lifecycles. The current implementation is a **typed
// stub** — it validates inputs, creates a real DB row, then
// immediately marks the run as `failed` with `LLM_PROVIDER_FAILED`
// because real LLM + sandbox-sweep integration is queued for a
// follow-up change (requires credentials + provider SDK + prompt
// templates that don't exist yet).
//
// The frontend stores (`signalReviewStore`, `optimlensStore`) already
// handle `unavailable` gracefully, so end-user behavior is
// "analysis unavailable, results omitted" rather than a broken screen.

package service

import (
	"context"
	"encoding/json"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// MaxParamGridCombos caps the cross-product of an OptimLens grid.
const MaxParamGridCombos = 50

// AnalysisService orchestrates AI-driven analysis tasks. Today it's a
// typed stub; the real orchestration lands with the LLM provider
// abstraction in a follow-up.
type AnalysisService struct {
	store *store.Store
}

// NewAnalysisService constructs the service.
func NewAnalysisService(st *store.Store) *AnalysisService {
	return &AnalysisService{store: st}
}

// StartOptimLens validates the request, creates an analysis_runs row,
// and immediately marks it failed with LLM_PROVIDER_FAILED. Returns
// the task ID so callers can poll the canonical status envelope.
func (a *AnalysisService) StartOptimLens(ctx context.Context, req model.OptimLensRequest) (string, *apierr.HTTPError) {
	if req.StrategyID == "" {
		return "", apierr.New(apierr.CodeInvalidRange, "strategy_id is required")
	}
	if len(req.Symbols) == 0 {
		return "", apierr.New(apierr.CodeInvalidSymbol, "symbols is required")
	}
	if len(req.ParamGrid) == 0 {
		return "", apierr.New(apierr.CodeInvalidRange, "param_grid is required")
	}
	combos := 1
	for _, values := range req.ParamGrid {
		if len(values) == 0 {
			return "", apierr.New(apierr.CodeInvalidRange, "param_grid axes must be non-empty")
		}
		combos *= len(values)
		if combos > MaxParamGridCombos {
			return "", apierr.New(apierr.CodeParamGridTooLarge, "param grid too large").
				WithDetails(map[string]any{"combos": combos, "max": MaxParamGridCombos})
		}
	}

	return a.startStub(ctx, model.AnalysisTypeOptimLens, req)
}

// StartSignalReview validates + stubs.
func (a *AnalysisService) StartSignalReview(ctx context.Context, req model.SignalReviewRequest) (string, *apierr.HTTPError) {
	if req.BacktestTaskID == "" {
		return "", apierr.New(apierr.CodeInvalidRange, "backtest_task_id is required")
	}
	return a.startStub(ctx, model.AnalysisTypeSignals, req)
}

// ExplainTrade is synchronous: returns the unavailable envelope directly.
func (a *AnalysisService) ExplainTrade(ctx context.Context, req model.TradeExplainRequest) (any, *apierr.HTTPError) {
	// Minimal validation: either (task_id, symbol, trade_id) trio OR
	// an inline trade payload.
	hasRef := req.BacktestTaskID != "" && req.Symbol != "" && req.TradeID != ""
	hasInline := req.Trade != nil
	if !hasRef && !hasInline {
		return nil, apierr.New(apierr.CodeInvalidRange,
			"provide either (backtest_task_id, symbol, trade_id) or inline trade")
	}
	return nil, apierr.New(apierr.CodeLLMProviderFailed,
		"LLM provider not configured — trade explanations will land with analysis-endpoints v2").
		WithDetails(map[string]any{
			"deferred": true,
			"tracking": "service-api-analysis-endpoints v2 (LLM integration)",
		})
}

// startStub persists a failed analysis_runs row and returns its ID.
// The frontend's `signalReviewStore` / `optimlensStore` polls, sees
// `status=failed` + `error.code=LLM_PROVIDER_FAILED`, and renders
// an "unavailable" banner instead of a hard error.
func (a *AnalysisService) startStub(ctx context.Context, kind string, req any) (string, *apierr.HTTPError) {
	cfg, err := json.Marshal(req)
	if err != nil {
		return "", apierr.Wrap(err, apierr.CodeInternalError, "marshal request: "+err.Error())
	}
	id, dberr := a.store.CreateAnalysisRun(ctx, kind, cfg)
	if dberr != nil {
		return "", apierr.Wrap(dberr, apierr.CodeInternalError, dberr.Error())
	}
	// Mark failed immediately — no goroutine needed for the stub path.
	_ = a.store.UpdateAnalysisRunFailed(ctx, id, map[string]any{
		"code":    string(apierr.CodeLLMProviderFailed),
		"message": "LLM provider not configured",
		"details": map[string]any{
			"deferred": true,
			"tracking": "service-api-analysis-endpoints v2 (LLM integration)",
		},
	})
	return id, nil
}

// GetAnalysisStatus fetches a run and returns it in a shape the handler
// can hand to RespondTask. The caller is responsible for mapping to
// the canonical TaskResponse envelope.
func (a *AnalysisService) GetAnalysisStatus(ctx context.Context, id, kind string) (model.AnalysisRun, bool, error) {
	return a.store.GetAnalysisRun(ctx, id, kind)
}

// RunningCount mirrors the backtest/screener services — always zero
// today since all stubs complete synchronously.
func (a *AnalysisService) RunningCount() int { return 0 }
