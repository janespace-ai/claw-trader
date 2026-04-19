// Package errors defines the canonical error-code dictionary shared
// with the frontend contract (`api/openapi.yaml` — `ErrorCode` enum)
// and wire envelope (`ErrorBody`).
//
// Handlers construct `*HTTPError` via `New` / `Wrap` and hand it to
// `handler.RespondError`, which writes the canonical body +
// corresponding HTTP status.
package errors

import "fmt"

// Code is a member of the fixed ErrorCode enum. Keep in sync with
// `api/openapi.yaml` schemas.ErrorCode; adding codes is safe,
// removing is breaking.
type Code string

const (
	CodeInvalidInterval         Code = "INVALID_INTERVAL"
	CodeInvalidSymbol           Code = "INVALID_SYMBOL"
	CodeInvalidRange            Code = "INVALID_RANGE"
	CodeSymbolNotFound          Code = "SYMBOL_NOT_FOUND"
	CodeStrategyNotFound        Code = "STRATEGY_NOT_FOUND"
	CodeStrategyVersionNotFound Code = "STRATEGY_VERSION_NOT_FOUND"
	CodeBacktestNotFound        Code = "BACKTEST_NOT_FOUND"
	CodeScreenerNotFound        Code = "SCREENER_NOT_FOUND"
	CodeTaskNotFound            Code = "TASK_NOT_FOUND"
	CodeComplianceFailed        Code = "COMPLIANCE_FAILED"
	CodeSandboxError            Code = "SANDBOX_ERROR"
	CodeSandboxTimeout          Code = "SANDBOX_TIMEOUT"
	CodeDataUnavailable         Code = "DATA_UNAVAILABLE"
	CodeRateLimited             Code = "RATE_LIMITED"
	CodeUpstreamUnreachable     Code = "UPSTREAM_UNREACHABLE"
	CodeInternalError           Code = "INTERNAL_ERROR"
	CodeParamGridTooLarge       Code = "PARAM_GRID_TOO_LARGE"
	CodeLLMProviderFailed       Code = "LLM_PROVIDER_FAILED"
	CodeLLMBudgetExceeded       Code = "LLM_BUDGET_EXCEEDED"
)

// HTTPError carries a canonical ErrorBody plus the HTTP status for the
// response. `Details` is a free-form payload — callers populate it
// per errors.md (e.g. `allowed_intervals` for CodeInvalidInterval).
type HTTPError struct {
	Status  int
	Code    Code
	Message string
	Details map[string]any
	Err     error // optional wrapped cause; not serialized to client
}

// Error implements the error interface.
func (e *HTTPError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap exposes the cause for errors.Is / errors.As.
func (e *HTTPError) Unwrap() error { return e.Err }

// New constructs an HTTPError with just a code + message. HTTP status
// is derived from the code via statusFor.
func New(code Code, msg string) *HTTPError {
	return &HTTPError{Status: statusFor(code), Code: code, Message: msg}
}

// Wrap attaches an error cause to an HTTPError — useful for logging
// the underlying driver error while still returning a canonical body.
func Wrap(err error, code Code, msg string) *HTTPError {
	return &HTTPError{Status: statusFor(code), Code: code, Message: msg, Err: err}
}

// WithDetails returns a shallow copy with the Details map replaced.
func (e *HTTPError) WithDetails(d map[string]any) *HTTPError {
	cp := *e
	cp.Details = d
	return &cp
}

// statusFor maps codes → default HTTP status. Callers can override by
// setting `.Status` directly after construction for rare cases.
func statusFor(code Code) int {
	switch code {
	case CodeInvalidInterval, CodeInvalidSymbol, CodeInvalidRange, CodeParamGridTooLarge:
		return 400
	case CodeComplianceFailed:
		return 400
	case CodeSymbolNotFound, CodeStrategyNotFound, CodeStrategyVersionNotFound,
		CodeBacktestNotFound, CodeScreenerNotFound, CodeTaskNotFound:
		return 404
	case CodeRateLimited:
		return 429
	case CodeSandboxTimeout:
		return 504
	case CodeUpstreamUnreachable:
		return 502
	case CodeLLMBudgetExceeded:
		return 402
	case CodeSandboxError, CodeDataUnavailable, CodeLLMProviderFailed, CodeInternalError:
		return 500
	default:
		return 500
	}
}
