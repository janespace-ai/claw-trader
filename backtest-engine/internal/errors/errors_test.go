package errors

import (
	stderrors "errors"
	"testing"
)

func TestNew_DefaultStatuses(t *testing.T) {
	cases := []struct {
		code   Code
		status int
	}{
		{CodeInvalidInterval, 400},
		{CodeInvalidSymbol, 400},
		{CodeSymbolNotFound, 404},
		{CodeBacktestNotFound, 404},
		{CodeTaskNotFound, 404},
		{CodeRateLimited, 429},
		{CodeSandboxTimeout, 504},
		{CodeUpstreamUnreachable, 502},
		{CodeSandboxError, 500},
		{CodeInternalError, 500},
		{CodeLLMBudgetExceeded, 402},
	}
	for _, tc := range cases {
		he := New(tc.code, "x")
		if he.Status != tc.status {
			t.Errorf("code %s: got status %d, want %d", tc.code, he.Status, tc.status)
		}
	}
}

func TestWrap_PreservesCause(t *testing.T) {
	cause := stderrors.New("underlying")
	he := Wrap(cause, CodeInternalError, "wrapped")
	if !stderrors.Is(he, cause) {
		t.Fatal("errors.Is should reach the cause")
	}
	if he.Message != "wrapped" {
		t.Errorf("message = %q", he.Message)
	}
}

func TestWithDetails_Copy(t *testing.T) {
	he := New(CodeInvalidInterval, "bad")
	withD := he.WithDetails(map[string]any{"allowed_intervals": []string{"1h"}})
	if he.Details != nil {
		t.Error("original should not be mutated")
	}
	if withD.Details["allowed_intervals"] == nil {
		t.Error("details not set on copy")
	}
}

func TestError_Format(t *testing.T) {
	he := New(CodeInvalidSymbol, "nope")
	if he.Error() != "INVALID_SYMBOL: nope" {
		t.Errorf("unexpected format: %q", he.Error())
	}
	cause := stderrors.New("db gone")
	wrapped := Wrap(cause, CodeInternalError, "boom")
	want := "INTERNAL_ERROR: boom: db gone"
	if wrapped.Error() != want {
		t.Errorf("unexpected wrapped format: %q", wrapped.Error())
	}
}
