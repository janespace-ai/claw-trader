package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

// KlineHandler serves candlestick queries by reading the shared Timescale
// tables that data-aggregator populates. backtest-engine acts as the read
// gateway for the frontend; the aggregator itself is now headless.
type KlineHandler struct {
	store *store.Store
}

// NewKlineHandler constructs the handler.
func NewKlineHandler(st *store.Store) *KlineHandler {
	return &KlineHandler{store: st}
}

// Query handles GET /api/klines?symbol=&interval=&from=&to=&market=&limit=.
// Dates accept RFC3339, YYYY-MM-DD, or unix seconds. Response shape is 1:1
// compatible with the old data-aggregator endpoint of the same path.
func (h *KlineHandler) Query(ctx context.Context, c *app.RequestContext) {
	symbol := string(c.Query("symbol"))
	interval := string(c.Query("interval"))
	market := string(c.Query("market"))
	if market == "" {
		market = "futures"
	}
	if symbol == "" || interval == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "symbol and interval are required"})
		return
	}
	if !store.IsSupportedInterval(interval) {
		c.JSON(http.StatusBadRequest, map[string]any{
			"error":            "unsupported interval",
			"allowed_intervals": store.SupportedIntervals,
		})
		return
	}

	from, err := parseKlineTime(string(c.Query("from")))
	if err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "bad 'from' param: " + err.Error()})
		return
	}
	to, err := parseKlineTime(string(c.Query("to")))
	if err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "bad 'to' param: " + err.Error()})
		return
	}
	if from.IsZero() {
		from = time.Now().UTC().Add(-30 * 24 * time.Hour)
	}
	if to.IsZero() {
		to = time.Now().UTC()
	}

	rows, err := h.store.QueryKlines(ctx, market, interval, symbol, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Optional `limit` param caps rows to the most recent N (QueryKlines
	// returns rows in ascending time order).
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n < len(rows) {
			rows = rows[len(rows)-n:]
		}
	}

	c.JSON(http.StatusOK, rows)
}

// parseKlineTime accepts empty, RFC3339, YYYY-MM-DD, or unix-second formats.
func parseKlineTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return time.Unix(n, 0).UTC(), nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse("2006-01-02", s)
	}
	return t.UTC(), err
}
