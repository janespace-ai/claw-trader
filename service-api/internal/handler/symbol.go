package handler

import (
	"context"
	"strconv"

	"github.com/cloudwego/hertz/pkg/app"

	apierr "github.com/janespace-ai/claw-trader/service-api/internal/errors"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
)

// SymbolHandler serves the active symbol list previously exposed by
// data-aggregator. It reads directly from the shared `claw.symbols` table.
type SymbolHandler struct {
	store *store.Store
}

// NewSymbolHandler constructs the handler.
func NewSymbolHandler(st *store.Store) *SymbolHandler {
	return &SymbolHandler{store: st}
}

// symbolCursor is the opaque resume-point — currently a simple offset
// since ListActiveSymbols doesn't expose a keyset API yet. Stored as
// base64(json); opaque to clients.
type symbolCursor struct {
	Offset int `json:"o"`
}

// List handles GET /api/symbols?market=futures&limit=300&cursor=.
// Returns a canonical Paginated<Symbol>.
func (h *SymbolHandler) List(ctx context.Context, c *app.RequestContext) {
	market := string(c.Query("market"))
	if market == "" {
		market = "futures"
	}
	limit := 300
	if v := string(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 1000 {
			limit = n
		}
	}

	// Fetch one extra to detect "more pages exist". Cursor isn't
	// consumed by the store yet; emitting it keeps the wire format
	// canonical and future-proofs clients.
	symbols, err := h.store.ListActiveSymbols(ctx, market, limit+1)
	if err != nil {
		RespondError(c, apierr.Wrap(err, apierr.CodeUpstreamUnreachable, err.Error()))
		return
	}
	var nextCursor *string
	cut := len(symbols)
	if cut > limit {
		cut = limit
		if ptr, cerr := model.EncodeCursor(symbolCursor{Offset: limit}); cerr == nil {
			nextCursor = ptr
		}
	}
	RespondPaginated(c, symbols[:cut], nextCursor)
}
