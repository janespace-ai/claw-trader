package handler

import (
	"context"
	"strconv"
	"time"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// KlineHandler serves candlestick queries by reading the shared Timescale
// tables that data-aggregator populates. service-api acts as the read
// gateway for the frontend; the aggregator itself is now headless.
type KlineHandler struct {
	store *store.Store
}

// NewKlineHandler constructs the handler.
func NewKlineHandler(st *store.Store) *KlineHandler {
	return &KlineHandler{store: st}
}

// Query handles GET /api/klines?symbol=&interval=&from=&to=&market=&limit=.
// `from` / `to` accept Unix seconds (canonical) or YYYY-MM-DD / RFC3339
// (still accepted one release for backward compat; the response adds
// a `Warning` header on those inputs).
func (h *KlineHandler) Query(ctx context.Context, c *app.RequestContext) {
	symbol := string(c.Query("symbol"))
	interval := string(c.Query("interval"))
	market := string(c.Query("market"))
	if market == "" {
		market = "futures"
	}
	if symbol == "" {
		RespondError(c, apierr.New(apierr.CodeInvalidSymbol, "symbol is required"))
		return
	}
	if interval == "" {
		RespondError(c, apierr.New(apierr.CodeInvalidInterval, "interval is required").
			WithDetails(map[string]any{"allowed_intervals": store.SupportedIntervals}))
		return
	}
	if !store.IsSupportedInterval(interval) {
		RespondError(c, apierr.New(apierr.CodeInvalidInterval, "unsupported interval").
			WithDetails(map[string]any{
				"interval":          interval,
				"allowed_intervals": store.SupportedIntervals,
			}))
		return
	}

	from, fromLegacy, err := parseKlineTime(string(c.Query("from")))
	if err != nil {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "bad 'from' param: "+err.Error()))
		return
	}
	to, toLegacy, err := parseKlineTime(string(c.Query("to")))
	if err != nil {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "bad 'to' param: "+err.Error()))
		return
	}
	if fromLegacy || toLegacy {
		c.Response.Header.Set(
			"Warning",
			`299 - "Deprecated: pass from/to as Unix seconds. String formats accepted for one release."`,
		)
	}
	if from.IsZero() {
		from = time.Now().UTC().Add(-30 * 24 * time.Hour)
	}
	if to.IsZero() {
		to = time.Now().UTC()
	}
	if !to.After(from) {
		RespondError(c, apierr.New(apierr.CodeInvalidRange, "'to' must be after 'from'"))
		return
	}

	rows, err := h.store.QueryKlines(ctx, market, interval, symbol, from, to)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeUpstreamUnreachable, err.Error()))
		return
	}

	// Optional `limit` param caps rows to the most recent N (QueryKlines
	// returns rows in ascending time order).
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n < len(rows) {
			rows = rows[len(rows)-n:]
		}
	}

	RespondOK(c, rows)
}

// parseKlineTime accepts empty, RFC3339, YYYY-MM-DD, or unix-second
// formats. The `legacy` return is true when the input was a string
// format (RFC3339 or YYYY-MM-DD) so callers can emit a Warning header.
func parseKlineTime(s string) (t time.Time, legacy bool, err error) {
	if s == "" {
		return time.Time{}, false, nil
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return time.Unix(n, 0).UTC(), false, nil
	}
	legacy = true
	if t, err = time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), true, nil
	}
	if t, err = time.Parse("2006-01-02", s); err == nil {
		return t.UTC(), true, nil
	}
	return time.Time{}, true, err
}
