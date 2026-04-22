package handler

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// SymbolMetadataHandler powers `GET /api/symbols/:symbol/metadata`.
type SymbolMetadataHandler struct {
	store *store.Store
}

// NewSymbolMetadataHandler constructs the handler.
func NewSymbolMetadataHandler(st *store.Store) *SymbolMetadataHandler {
	return &SymbolMetadataHandler{store: st}
}

var symbolPattern = regexp.MustCompile(`^[A-Z0-9_]+$`)

// Get handles GET /api/symbols/:symbol/metadata.
func (h *SymbolMetadataHandler) Get(ctx context.Context, c *app.RequestContext) {
	raw := c.Param("symbol")
	symbol := strings.ToUpper(raw)
	if !symbolPattern.MatchString(symbol) {
		RespondError(c, apierr.New(apierr.CodeInvalidSymbol,
			"symbol must match ^[A-Z0-9_]+$").
			WithDetails(map[string]any{"symbol": raw}))
		return
	}

	row, ok, err := h.store.SymbolRow(ctx, symbol)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeUpstreamUnreachable, err.Error()))
		return
	}
	if !ok {
		RespondError(c, apierr.New(apierr.CodeSymbolNotFound, "symbol not found").
			WithDetails(map[string]any{"symbol": symbol}))
		return
	}

	firstTs, lastTs, lastPrice, _ := h.store.LastKlineInfo(ctx, symbol)

	resp := map[string]any{
		"symbol": row.Symbol,
		"market": row.Market,
		"status": row.Status,
	}
	if row.Rank > 0 {
		resp["rank"] = row.Rank
	} else {
		resp["rank"] = nil
	}
	if row.Volume24h > 0 {
		resp["volume_24h_quote"] = row.Volume24h
	} else {
		resp["volume_24h_quote"] = nil
	}
	if !firstTs.IsZero() {
		resp["first_kline_at"] = firstTs.Unix()
	} else {
		resp["first_kline_at"] = nil
	}
	if !lastTs.IsZero() {
		resp["last_kline_at"] = lastTs.Unix()
	} else {
		resp["last_kline_at"] = nil
	}
	if lastPrice > 0 {
		resp["last_price"] = lastPrice
		// 24h change: compare to close at (lastTs - 24h).
		if !lastTs.IsZero() {
			prev, prevOk, _ := h.store.CloseAtOrBefore(ctx, symbol, lastTs.Add(-24*time.Hour))
			if prevOk && prev > 0 {
				resp["change_24h_pct"] = (lastPrice - prev) / prev
			} else {
				resp["change_24h_pct"] = nil
			}
		}
	} else {
		resp["last_price"] = nil
		resp["change_24h_pct"] = nil
	}

	RespondOK(c, resp)
}
