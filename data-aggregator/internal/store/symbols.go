package store

import (
	"context"
	"fmt"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
)

// UpsertSymbols writes the given active top-N list and nullifies rank for symbols
// that have fallen out of the list (they remain in the table, historical data preserved).
func (s *Store) UpsertSymbols(ctx context.Context, market string, symbols []model.Symbol) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Null rank for everyone first - any ones we're about to upsert will be overwritten.
	if _, err := tx.Exec(ctx,
		fmt.Sprintf(`UPDATE %s.symbols SET rank = NULL, updated_at = now() WHERE market = $1`, s.schema),
		market,
	); err != nil {
		return fmt.Errorf("null previous ranks: %w", err)
	}

	upsert := fmt.Sprintf(`
		INSERT INTO %s.symbols (symbol, market, rank, trade_size, volume_24h_quote, status, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now())
		ON CONFLICT (market, symbol) DO UPDATE SET
			rank = EXCLUDED.rank,
			trade_size = EXCLUDED.trade_size,
			volume_24h_quote = EXCLUDED.volume_24h_quote,
			status = EXCLUDED.status,
			updated_at = now()
	`, s.schema)
	for _, sym := range symbols {
		if _, err := tx.Exec(ctx, upsert,
			sym.Symbol, sym.Market, sym.Rank, 0.0, sym.Volume24hQuote, sym.Status,
		); err != nil {
			return fmt.Errorf("upsert %s: %w", sym.Symbol, err)
		}
	}

	return tx.Commit(ctx)
}

// ActiveSymbols returns symbols with non-null rank for the given market, ordered by rank asc.
func (s *Store) ActiveSymbols(ctx context.Context, market string, limit int) ([]model.Symbol, error) {
	if limit <= 0 {
		limit = 300
	}
	sql := fmt.Sprintf(`
		SELECT symbol, market, rank, COALESCE(volume_24h_quote, 0), status, updated_at
		FROM %s.symbols
		WHERE market = $1 AND rank IS NOT NULL AND status = 'active'
		ORDER BY rank ASC
		LIMIT $2
	`, s.schema)
	rows, err := s.pool.Query(ctx, sql, market, limit)
	if err != nil {
		return nil, fmt.Errorf("active symbols: %w", err)
	}
	defer rows.Close()

	result := make([]model.Symbol, 0, limit)
	for rows.Next() {
		var sym model.Symbol
		var rank *int
		if err := rows.Scan(&sym.Symbol, &sym.Market, &rank, &sym.Volume24hQuote, &sym.Status, &sym.UpdatedAt); err != nil {
			return nil, err
		}
		sym.Rank = rank
		result = append(result, sym)
	}
	return result, rows.Err()
}

// AllSymbols returns every row for the market including rank=NULL (dropped) entries.
func (s *Store) AllSymbols(ctx context.Context, market string) ([]model.Symbol, error) {
	sql := fmt.Sprintf(`
		SELECT symbol, market, rank, COALESCE(volume_24h_quote, 0), status, updated_at
		FROM %s.symbols
		WHERE market = $1
		ORDER BY rank ASC NULLS LAST, symbol ASC
	`, s.schema)
	rows, err := s.pool.Query(ctx, sql, market)
	if err != nil {
		return nil, fmt.Errorf("all symbols: %w", err)
	}
	defer rows.Close()

	result := []model.Symbol{}
	for rows.Next() {
		var sym model.Symbol
		var rank *int
		if err := rows.Scan(&sym.Symbol, &sym.Market, &rank, &sym.Volume24hQuote, &sym.Status, &sym.UpdatedAt); err != nil {
			return nil, err
		}
		sym.Rank = rank
		result = append(result, sym)
	}
	return result, rows.Err()
}
