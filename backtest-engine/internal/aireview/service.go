package aireview

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/config"
)

// Verdict is the canonical result of a Gate 2 review.
//
// ``Verdict`` field values are exactly "approve" or "reject" — any other
// string is normalized to "reject" before returning.
//
// ``Dimensions`` preserves the per-dimension breakdown ("security", "correctness")
// → ("pass", "fail"), which is handed to the frontend so users see WHICH gate
// tripped without calling back to the audit table.
type Verdict struct {
	Verdict    string            `json:"verdict"`
	Reason     string            `json:"reason"`
	Model      string            `json:"model"`
	Dimensions map[string]string `json:"dimensions"`
	CacheHit   bool              `json:"cache_hit"`
	CodeHash   string            `json:"code_hash"`
	CreatedAt  time.Time         `json:"-"`
	ExpiresAt  time.Time         `json:"-"`
}

// IsApproved reports whether the verdict passed both dimensions.
func (v Verdict) IsApproved() bool { return v.Verdict == "approve" }

// ErrUnavailable is returned by Review when AI review is required but the
// service is not usable (missing API key, disabled, or startup check failed).
// The handler layer should translate this to HTTP 503 + AI_REVIEW_UNAVAILABLE.
//
// Critically: ErrUnavailable is distinct from a reject.  A reject is a
// successful review with a "no" answer; unavailable means we can't even
// form an opinion.  Both fail-close the submit, but the user-facing message
// should differ ("code rejected for X" vs "reviewer temporarily unavailable").
var ErrUnavailable = errors.New("ai review unavailable")

// Service is the Gate 2 entry point.  Call Review() per-submit.
//
// Concurrency: Service is safe for concurrent use; all methods are
// self-contained and delegate to the pool / http client.
type Service struct {
	cfg     config.AIReviewConfig
	client  *DeepSeekClient
	cache   *Cache
	audit   *Auditor
	enabled bool // final "should we even try" — cached at construction
}

// NewService wires the Gate 2 reviewer.  Call Start(ctx) afterwards to run
// the model-drift cache purge.
func NewService(cfg config.AIReviewConfig, pool *pgxpool.Pool, schema string) *Service {
	enabled := cfg.Enabled && cfg.APIKey != "" && SystemPrompt(cfg.PromptVersion) != ""
	return &Service{
		cfg: cfg,
		client: NewDeepSeekClient(cfg.BaseURL, cfg.APIKey,
			time.Duration(cfg.TimeoutSeconds)*time.Second),
		cache:   NewCache(pool, schema, cfg.CacheTTLDays),
		audit:   NewAuditor(pool, schema),
		enabled: enabled,
	}
}

// Start runs one-off maintenance: purge cache rows whose model doesn't
// match the currently-configured one.  Call once during app boot.
//
// Safe to skip if the cache schema hasn't been migrated yet — logs a
// warning and returns nil so the app keeps booting.  (The real Review
// call will then cache-miss and upsert fresh rows.)
func (s *Service) Start(ctx context.Context) error {
	if !s.enabled {
		log.Printf("[aireview] disabled: enabled=%v has_key=%v prompt=%q",
			s.cfg.Enabled, s.cfg.APIKey != "", s.cfg.PromptVersion)
		return nil
	}
	n, err := s.cache.PurgeModelDrift(ctx, s.cfg.Model)
	if err != nil {
		log.Printf("[aireview] model-drift purge skipped: %v", err)
		return nil
	}
	if n > 0 {
		log.Printf("[aireview] purged %d stale cache rows (model drift)", n)
	}
	return nil
}

// Enabled reports whether Review() will actually call the model.  When
// false, the service always returns ErrUnavailable (fail-closed) — the
// handler must translate to 503.
func (s *Service) Enabled() bool { return s.enabled }

// Review runs Gate 2 against the given user code.
//
// Returns:
//
//  - (Verdict{Verdict:"approve"}, nil)  → accept; code is safe + plausible.
//  - (Verdict{Verdict:"reject"}, nil)   → reject with reason / dimensions.
//  - (zero, ErrUnavailable)             → service disabled or key missing;
//                                          handler returns 503.
//
// Fail-closed on any transport / parse error: we log the root cause and
// return (reject, nil) with a generic reason.  The model is never trusted
// to decide "I can't decide, approve anyway".
//
// ``modeHint`` is one of "backtest" / "screener" / "optimization" and is
// included in the user prompt so the model can catch trivial shape errors
// (e.g. a backtest code with no on_bar method).
//
// ``taskID`` is optional — only non-empty when this call is tied to a
// specific backtest/screener submission, for audit correlation.
func (s *Service) Review(ctx context.Context, code, modeHint, taskID string) (Verdict, error) {
	if !s.enabled {
		return Verdict{}, ErrUnavailable
	}

	codeHash := Hash(code)
	model := s.cfg.Model

	// 1. Cache hit?
	if cached, err := s.cache.Get(ctx, codeHash, model); err == nil && cached != nil {
		cached.CacheHit = true
		cached.CodeHash = codeHash
		s.recordAudit(ctx, cached, taskID, 0)
		return *cached, nil
	}
	// Cache errors fall through — we'd rather pay the model roundtrip than
	// fail-close on a transient DB blip.  The re-put will succeed next time.

	// 2. Live call.
	started := time.Now()
	messages := BuildMessages(code, modeHint)
	content, _, err := s.client.Chat(ctx, model, messages)
	latency := time.Since(started)

	if err != nil {
		// Any wire-level error → reject.  We still audit so ops can see WHY.
		v := rejectFromError(err, model, codeHash)
		s.recordAudit(ctx, &v, taskID, int(latency.Milliseconds()))
		log.Printf("[aireview] call failed, rejecting (task=%s): %v", taskID, err)
		return v, nil
	}

	v, parseErr := parseVerdict(content)
	v.Model = model
	v.CodeHash = codeHash
	v.CacheHit = false

	if parseErr != nil {
		// Model returned unparseable JSON or an unexpected shape.  Reject.
		v = Verdict{
			Verdict:    "reject",
			Reason:     "ai_review: model returned unparseable response",
			Model:      model,
			CodeHash:   codeHash,
			Dimensions: map[string]string{"security": "fail", "correctness": "fail"},
		}
		s.recordAudit(ctx, &v, taskID, int(latency.Milliseconds()))
		log.Printf("[aireview] parse failed, rejecting (task=%s): %v raw=%q",
			taskID, parseErr, truncate(content, 400))
		return v, nil
	}

	// 3. Persist.  Cache errors are non-fatal; we already have a verdict
	// and the next call for this code will simply miss + re-query.
	if putErr := s.cache.Put(ctx, v); putErr != nil {
		log.Printf("[aireview] cache put failed (task=%s): %v", taskID, putErr)
	}
	s.recordAudit(ctx, &v, taskID, int(latency.Milliseconds()))
	return v, nil
}

// ---- Internals -------------------------------------------------------------

// parseVerdict is the "ingest the model's answer" step.  We're strict:
//
//  - JSON must parse.
//  - "verdict" must be exactly "approve" or "reject" (case-insensitive).
//  - "dimensions" map is optional but normalized to {security,correctness}.
//  - Anything unexpected → error (→ fail-closed reject in caller).
func parseVerdict(content string) (Verdict, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return Verdict{}, fmt.Errorf("empty response")
	}
	// The model sometimes wraps the JSON in ```json fences despite json_object
	// mode.  Strip them defensively.
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var raw struct {
		Verdict    string            `json:"verdict"`
		Reason     string            `json:"reason"`
		Dimensions map[string]string `json:"dimensions"`
	}
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return Verdict{}, fmt.Errorf("json: %w", err)
	}

	verdict := strings.ToLower(strings.TrimSpace(raw.Verdict))
	switch verdict {
	case "approve":
		// Defence-in-depth: only approve if BOTH dimensions explicitly pass.
		// A malformed "approve" with bad dimensions → treat as reject.
		if raw.Dimensions != nil &&
			(strings.ToLower(raw.Dimensions["security"]) != "pass" ||
				strings.ToLower(raw.Dimensions["correctness"]) != "pass") {
			return Verdict{
				Verdict:    "reject",
				Reason:     "model said approve but flagged a dimension failure",
				Dimensions: raw.Dimensions,
			}, nil
		}
	case "reject":
		// expected
	default:
		// Unknown verdict string → fail-closed reject.
		return Verdict{
			Verdict:    "reject",
			Reason:     fmt.Sprintf("unknown verdict %q", raw.Verdict),
			Dimensions: raw.Dimensions,
		}, nil
	}
	if raw.Dimensions == nil {
		raw.Dimensions = map[string]string{}
	}
	return Verdict{
		Verdict:    verdict,
		Reason:     raw.Reason,
		Dimensions: raw.Dimensions,
	}, nil
}

// rejectFromError builds a reject verdict for infrastructure failures.
// Kept separate from parse-failure rejects so the audit table distinguishes
// "couldn't reach the model" from "model said something weird".
func rejectFromError(err error, model, codeHash string) Verdict {
	// Trim the error so we don't put huge blobs into the audit reason column.
	msg := err.Error()
	if len(msg) > 200 {
		msg = msg[:200] + "…"
	}
	reason := "ai_review: " + msg
	// Keep it user-safe: if the error leaks the host or API key (shouldn't
	// happen, but defense in depth), redact.
	reason = strings.ReplaceAll(reason, "Bearer ", "Bearer ***")
	return Verdict{
		Verdict:    "reject",
		Reason:     reason,
		Model:      model,
		CodeHash:   codeHash,
		Dimensions: map[string]string{"security": "fail", "correctness": "fail"},
	}
}

func (s *Service) recordAudit(ctx context.Context, v *Verdict, taskID string, latencyMs int) {
	if err := s.audit.Record(ctx, AuditRecord{
		TaskID:     taskID,
		CodeHash:   v.CodeHash,
		Model:      v.Model,
		Verdict:    v.Verdict,
		Reason:     v.Reason,
		Dimensions: v.Dimensions,
		CacheHit:   v.CacheHit,
		LatencyMs:  latencyMs,
	}); err != nil {
		// Don't fail the user submit just because audit persistence blinked.
		log.Printf("[aireview] audit write failed (task=%s): %v", taskID, err)
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
