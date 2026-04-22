package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
)

// stubChecker satisfies DataChecker deterministically without a DB.
type stubChecker struct {
	hasKlines map[string]bool
	err       error
}

func (s *stubChecker) HasKlines(ctx context.Context, market, interval, symbol string, from, to time.Time) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	ok, found := s.hasKlines[symbol]
	if !found {
		return true, nil
	}
	return ok, nil
}

func goodConfig() model.BacktestConfig {
	return model.BacktestConfig{
		Symbols:  []string{"BTC_USDT", "ETH_USDT"},
		Interval: "1h",
		From:     "1700000000",
		To:       "1700100000",
	}
}

func TestValidateSubmit_Happy(t *testing.T) {
	err := ValidateSubmit(context.Background(), goodConfig(), "futures", nil)
	if err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestValidateSubmit_EmptySymbols(t *testing.T) {
	cfg := goodConfig()
	cfg.Symbols = []string{}
	err := ValidateSubmit(context.Background(), cfg, "futures", nil)
	if err == nil || err.Code != apierr.CodeInvalidSymbol {
		t.Fatalf("expected INVALID_SYMBOL, got %v", err)
	}
}

func TestValidateSubmit_TooManySymbols(t *testing.T) {
	cfg := goodConfig()
	cfg.Symbols = make([]string, MaxSymbolsPerRun+1)
	for i := range cfg.Symbols {
		cfg.Symbols[i] = fmt.Sprintf("SYM%d_USDT", i)
	}
	err := ValidateSubmit(context.Background(), cfg, "futures", nil)
	if err == nil || err.Code != apierr.CodeInvalidSymbol {
		t.Fatalf("expected INVALID_SYMBOL, got %v", err)
	}
}

func TestValidateSubmit_DuplicateSymbol(t *testing.T) {
	cfg := goodConfig()
	cfg.Symbols = []string{"BTC_USDT", "BTC_USDT"}
	err := ValidateSubmit(context.Background(), cfg, "futures", nil)
	if err == nil || err.Code != apierr.CodeInvalidSymbol {
		t.Fatalf("expected INVALID_SYMBOL for dup, got %v", err)
	}
}

func TestValidateSubmit_BadInterval(t *testing.T) {
	cfg := goodConfig()
	cfg.Interval = "13m"
	err := ValidateSubmit(context.Background(), cfg, "futures", nil)
	if err == nil || err.Code != apierr.CodeInvalidInterval {
		t.Fatalf("expected INVALID_INTERVAL, got %v", err)
	}
}

func TestValidateSubmit_MissingInterval(t *testing.T) {
	cfg := goodConfig()
	cfg.Interval = ""
	err := ValidateSubmit(context.Background(), cfg, "futures", nil)
	if err == nil || err.Code != apierr.CodeInvalidInterval {
		t.Fatalf("expected INVALID_INTERVAL, got %v", err)
	}
}

func TestValidateSubmit_BadRange(t *testing.T) {
	cfg := goodConfig()
	cfg.From = "1700100000"
	cfg.To = "1700000000"
	err := ValidateSubmit(context.Background(), cfg, "futures", nil)
	if err == nil || err.Code != apierr.CodeInvalidRange {
		t.Fatalf("expected INVALID_RANGE, got %v", err)
	}
}

func TestValidateSubmit_UnavailableData(t *testing.T) {
	cfg := goodConfig()
	checker := &stubChecker{
		hasKlines: map[string]bool{"BTC_USDT": true, "ETH_USDT": false},
	}
	err := ValidateSubmit(context.Background(), cfg, "futures", checker)
	if err == nil || err.Code != apierr.CodeDataUnavailable {
		t.Fatalf("expected DATA_UNAVAILABLE, got %v", err)
	}
	if err.Details["missing"] == nil {
		t.Errorf("expected details.missing, got %v", err.Details)
	}
}

func TestValidateSubmit_LookbackMustBePositive(t *testing.T) {
	cfg := goodConfig()
	neg := -5
	cfg.PreviewLookbackDays = &neg
	err := ValidateSubmit(context.Background(), cfg, "futures", nil)
	if err == nil || err.Code != apierr.CodeInvalidRange {
		t.Fatalf("expected INVALID_RANGE, got %v", err)
	}
}
