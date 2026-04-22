package service_test

import (
	"context"
	"testing"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
	"github.com/janespace-ai/claw-trader/service-api/internal/service"
	"github.com/janespace-ai/claw-trader/service-api/internal/testdb"
)

func TestStartOptimLens_Validation(t *testing.T) {
	st := testdb.New(t)
	svc := service.NewAnalysisService(st)
	ctx := context.Background()

	cases := []struct {
		name     string
		req      model.OptimLensRequest
		wantCode apierr.Code
	}{
		{
			name:     "empty strategy id",
			req:      model.OptimLensRequest{Symbols: []string{"BTC_USDT"}, ParamGrid: map[string][]interface{}{"x": {1}}},
			wantCode: apierr.CodeInvalidRange,
		},
		{
			name:     "no symbols",
			req:      model.OptimLensRequest{StrategyID: "s1", ParamGrid: map[string][]interface{}{"x": {1}}},
			wantCode: apierr.CodeInvalidSymbol,
		},
		{
			name:     "empty param grid",
			req:      model.OptimLensRequest{StrategyID: "s1", Symbols: []string{"BTC_USDT"}},
			wantCode: apierr.CodeInvalidRange,
		},
		{
			name: "over-large grid",
			req: model.OptimLensRequest{
				StrategyID: "s1",
				Symbols:    []string{"BTC_USDT"},
				ParamGrid: map[string][]interface{}{
					"a": makeRange(10), "b": makeRange(10), "c": makeRange(10),
				},
			},
			wantCode: apierr.CodeParamGridTooLarge,
		},
		{
			name: "empty axis",
			req: model.OptimLensRequest{
				StrategyID: "s1",
				Symbols:    []string{"BTC_USDT"},
				ParamGrid:  map[string][]interface{}{"x": {}},
			},
			wantCode: apierr.CodeInvalidRange,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, herr := svc.StartOptimLens(ctx, tc.req)
			if herr == nil {
				t.Fatal("expected error, got nil")
			}
			if herr.Code != tc.wantCode {
				t.Errorf("code = %s, want %s", herr.Code, tc.wantCode)
			}
		})
	}
}

func TestStartSignalReview_RequiresTaskID(t *testing.T) {
	st := testdb.New(t)
	svc := service.NewAnalysisService(st)
	_, herr := svc.StartSignalReview(context.Background(), model.SignalReviewRequest{})
	if herr == nil || herr.Code != apierr.CodeInvalidRange {
		t.Fatalf("expected INVALID_RANGE, got %v", herr)
	}
}

func TestExplainTrade_RequiresEitherFormOfRequest(t *testing.T) {
	st := testdb.New(t)
	svc := service.NewAnalysisService(st)
	_, herr := svc.ExplainTrade(context.Background(), model.TradeExplainRequest{})
	if herr == nil || herr.Code != apierr.CodeInvalidRange {
		t.Fatalf("expected INVALID_RANGE, got %v", herr)
	}
}

func makeRange(n int) []interface{} {
	out := make([]interface{}, n)
	for i := range out {
		out[i] = i
	}
	return out
}
