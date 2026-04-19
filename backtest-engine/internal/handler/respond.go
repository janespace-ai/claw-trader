package handler

import (
	stderrors "errors"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/backtest-engine/internal/errors"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
)

// RespondOK writes a plain 200 JSON response. Used for synchronous
// responses that don't fit the TaskResponse envelope (e.g. listing
// strategies, fetching klines).
func RespondOK(c *app.RequestContext, body any) {
	c.JSON(http.StatusOK, body)
}

// RespondTask writes a canonical `TaskResponse` envelope. Status is
// always 200 — the `task.Status` field carries the phase (pending /
// running / done / failed / cancelled).
func RespondTask(c *app.RequestContext, task model.TaskResponse) {
	c.JSON(http.StatusOK, task)
}

// RespondPaginated writes a canonical paginated envelope.
func RespondPaginated[T any](c *app.RequestContext, items []T, nextCursor *string) {
	payload := map[string]any{"items": items}
	if nextCursor != nil {
		payload["next_cursor"] = *nextCursor
	} else {
		payload["next_cursor"] = nil
	}
	c.JSON(http.StatusOK, payload)
}

// RespondError writes a canonical `ErrorResponse` envelope. If the
// passed `err` isn't an `*HTTPError`, it's wrapped as INTERNAL_ERROR.
func RespondError(c *app.RequestContext, err error) {
	var he *apierr.HTTPError
	if !stderrors.As(err, &he) {
		he = apierr.Wrap(err, apierr.CodeInternalError, "internal error")
	}
	body := map[string]any{
		"code":    string(he.Code),
		"message": he.Message,
	}
	if he.Details != nil {
		body["details"] = he.Details
	}
	c.JSON(he.Status, map[string]any{"error": body})
}
