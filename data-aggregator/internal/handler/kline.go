package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// KlineHandler serves candlestick queries.
type KlineHandler struct {
	store *store.Store
}

// NewKlineHandler constructs the handler.
func NewKlineHandler(st *store.Store) *KlineHandler {
	return &KlineHandler{store: st}
}

type klineResponse struct {
	Ts int64    `json:"ts"`
	O  float64  `json:"o"`
	H  float64  `json:"h"`
	L  float64  `json:"l"`
	C  float64  `json:"c"`
	V  float64  `json:"v"`
	QV *float64 `json:"qv,omitempty"`
}

// Query handles GET /api/klines?symbol=&interval=&from=&to=&market=.
// Dates accept RFC3339 or unix seconds.
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
	if !model.IsSupportedInterval(interval) {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "unsupported interval"})
		return
	}

	from, err := parseTime(string(c.Query("from")))
	if err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "bad 'from' param: " + err.Error()})
		return
	}
	to, err := parseTime(string(c.Query("to")))
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

	rows, err := h.store.QueryCandles(ctx, market, interval, symbol, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Optional `limit` param caps the number of returned candles. When applied,
	// we keep the most recent N (QueryCandles returns rows in ascending time order).
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n < len(rows) {
			rows = rows[len(rows)-n:]
		}
	}

	resp := make([]klineResponse, 0, len(rows))
	for _, r := range rows {
		resp = append(resp, klineResponse{
			Ts: r.Ts.Unix(),
			O:  r.Open, H: r.High, L: r.Low, C: r.Close,
			V:  r.Volume,
			QV: r.QuoteVolume,
		})
	}
	c.JSON(http.StatusOK, resp)
}

// parseTime accepts empty, RFC3339, or unix-second formats.
func parseTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	// unix seconds
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return time.Unix(n, 0).UTC(), nil
	}
	// RFC3339
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		// Try date-only
		t, err = time.Parse("2006-01-02", s)
	}
	return t.UTC(), err
}
