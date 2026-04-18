package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// SymbolService refreshes the top-N list from Gate.io and persists it.
type SymbolService struct {
	cfg    config.GateioConfig
	top    int
	client *http.Client
	store  *store.Store
}

// NewSymbolService constructs a SymbolService.
func NewSymbolService(cfg config.GateioConfig, topN int, st *store.Store) *SymbolService {
	return &SymbolService{
		cfg: cfg,
		top: topN,
		client: &http.Client{
			Timeout: time.Duration(cfg.RequestTimeoutSec) * time.Second,
		},
		store: st,
	}
}

// gateioTicker mirrors the fields we care about from
// GET /api/v4/futures/usdt/tickers.
// Numeric fields are serialized as strings by Gate.io.
type gateioTicker struct {
	Contract       string `json:"contract"`
	Last           string `json:"last"`
	Volume24h      string `json:"volume_24h"`
	Volume24hBase  string `json:"volume_24h_base"`
	Volume24hQuote string `json:"volume_24h_quote"`
}

// Refresh pulls all futures USDT tickers, picks the top-N by USDT 24h volume,
// and upserts them into claw.symbols. Returns the list written.
func (s *SymbolService) Refresh(ctx context.Context) ([]model.Symbol, error) {
	url := s.cfg.APIBaseURL + s.cfg.TickersEndpoint
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build tickers request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call tickers: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("tickers returned %d: %s", resp.StatusCode, string(body))
	}

	var tickers []gateioTicker
	if err := json.NewDecoder(resp.Body).Decode(&tickers); err != nil {
		return nil, fmt.Errorf("decode tickers: %w", err)
	}

	// Sort by USDT quote volume descending.
	sort.Slice(tickers, func(i, j int) bool {
		vi, _ := strconv.ParseFloat(tickers[i].Volume24hQuote, 64)
		vj, _ := strconv.ParseFloat(tickers[j].Volume24hQuote, 64)
		return vi > vj
	})

	limit := s.top
	if len(tickers) < limit {
		limit = len(tickers)
	}

	result := make([]model.Symbol, 0, limit)
	for i := 0; i < limit; i++ {
		t := tickers[i]
		vol, _ := strconv.ParseFloat(t.Volume24hQuote, 64)
		rank := i + 1
		result = append(result, model.Symbol{
			Symbol:         t.Contract,
			Market:         "futures",
			Rank:           &rank,
			Volume24hQuote: vol,
			Status:         "active",
			UpdatedAt:      time.Now(),
		})
	}

	if err := s.store.UpsertSymbols(ctx, "futures", result); err != nil {
		return nil, fmt.Errorf("upsert symbols: %w", err)
	}
	return result, nil
}

// List returns the currently active (ranked) symbols from the DB.
func (s *SymbolService) List(ctx context.Context, market string, limit int) ([]model.Symbol, error) {
	return s.store.ActiveSymbols(ctx, market, limit)
}
