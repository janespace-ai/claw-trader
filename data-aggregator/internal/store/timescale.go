package store

import (
	"bytes"
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"
	"text/template"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/model"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store wraps a pgx connection pool and the configured schema name.
type Store struct {
	pool   *pgxpool.Pool
	schema string
}

// New opens a pgx connection pool. Caller must Close() when done.
func New(ctx context.Context, cfg config.DatabaseConfig) (*Store, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DSN())
	if err != nil {
		return nil, fmt.Errorf("parse pool config: %w", err)
	}
	if cfg.MaxConns > 0 {
		poolCfg.MaxConns = int32(cfg.MaxConns)
	}
	if cfg.MinConns > 0 {
		poolCfg.MinConns = int32(cfg.MinConns)
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return NewFromPool(pool, cfg.Schema), nil
}

// NewFromPool wraps an already-open pool with an explicit schema name.
// Exposed for tests that want to inject an isolated schema. Production
// callers should use New.
func NewFromPool(pool *pgxpool.Pool, schema string) *Store {
	return &Store{pool: pool, schema: schema}
}

// Close releases the pool.
func (s *Store) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// Pool exposes the underlying pool for advanced queries.
func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// TableName returns the fully-qualified hypertable name for (market, interval).
// Example: TableName("futures", "5m") => "claw.futures_5m".
func (s *Store) TableName(market, interval string) string {
	return fmt.Sprintf("%s.%s_%s", s.schema, market, interval)
}

// Migrate applies every SQL file under migrations/ in filename order.
// Migrations are idempotent (use IF NOT EXISTS, if_not_exists=> TRUE).
//
// Each SQL file is rendered through text/template with {"Schema": s.schema}
// before execution, so `{{.Schema}}` placeholders resolve to the configured
// schema. In production this is "claw"; in tests this is a disposable
// per-suite schema injected via NewFromPool.
func (s *Store) Migrate(ctx context.Context) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	files := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		files = append(files, e.Name())
	}
	sort.Strings(files)

	for _, name := range files {
		sqlBytes, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		rendered, err := renderMigration(name, string(sqlBytes), s.schema)
		if err != nil {
			return fmt.Errorf("render migration %s: %w", name, err)
		}
		if _, err := s.pool.Exec(ctx, rendered); err != nil {
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
	}
	return nil
}

// renderMigration executes the migration SQL as a text/template with the
// given schema substituted for {{.Schema}}. Kept package-private.
func renderMigration(name, sql, schema string) (string, error) {
	tmpl, err := template.New(name).Option("missingkey=error").Parse(sql)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, map[string]string{"Schema": schema}); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// CopyCandles bulk-inserts candlesticks using pgx's COPY protocol.
// Duplicates (symbol, ts) are resolved by staging to a TEMP table + INSERT ... ON CONFLICT DO NOTHING.
// Returns the count of rows written to the staging area (not the final inserted count).
func (s *Store) CopyCandles(ctx context.Context, market, interval string, rows []model.Candlestick) (int64, error) {
	if len(rows) == 0 {
		return 0, nil
	}

	table := s.TableName(market, interval)

	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return 0, fmt.Errorf("acquire conn: %w", err)
	}
	defer conn.Release()

	tx, err := conn.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Stage to a TEMP table that mirrors the target, then upsert with ON CONFLICT.
	const stagingName = "candles_staging"
	createStaging := fmt.Sprintf(
		`CREATE TEMP TABLE %s (LIKE %s INCLUDING DEFAULTS) ON COMMIT DROP`,
		stagingName, table,
	)
	if _, err := tx.Exec(ctx, createStaging); err != nil {
		return 0, fmt.Errorf("create staging: %w", err)
	}

	copied, err := tx.CopyFrom(
		ctx,
		pgx.Identifier{stagingName},
		[]string{"ts", "symbol", "open", "high", "low", "close", "volume", "quote_volume"},
		pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
			r := rows[i]
			return []any{r.Ts, r.Symbol, r.Open, r.High, r.Low, r.Close, r.Volume, r.QuoteVolume}, nil
		}),
	)
	if err != nil {
		return 0, fmt.Errorf("copy rows: %w", err)
	}

	insertSQL := fmt.Sprintf(
		`INSERT INTO %s (ts, symbol, open, high, low, close, volume, quote_volume)
		 SELECT ts, symbol, open, high, low, close, volume, quote_volume FROM %s
		 ON CONFLICT (symbol, ts) DO NOTHING`,
		table, stagingName,
	)
	if _, err := tx.Exec(ctx, insertSQL); err != nil {
		return 0, fmt.Errorf("insert from staging: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}

	return copied, nil
}

// LatestTimestamp returns the most recent ts in the table for (market, interval, symbol),
// or zero time when no rows exist.
func (s *Store) LatestTimestamp(ctx context.Context, market, interval, symbol string) (time.Time, error) {
	table := s.TableName(market, interval)
	query := fmt.Sprintf(`SELECT COALESCE(MAX(ts), '0001-01-01'::timestamptz) FROM %s WHERE symbol = $1`, table)

	var ts time.Time
	if err := s.pool.QueryRow(ctx, query, symbol).Scan(&ts); err != nil {
		return time.Time{}, fmt.Errorf("latest ts: %w", err)
	}
	return ts, nil
}

// QueryCandles reads OHLCV rows in [from, to] ordered by ts ASC.
func (s *Store) QueryCandles(ctx context.Context, market, interval, symbol string, from, to time.Time) ([]model.Candlestick, error) {
	table := s.TableName(market, interval)
	query := fmt.Sprintf(
		`SELECT ts, symbol, open, high, low, close, volume, quote_volume
		 FROM %s
		 WHERE symbol = $1 AND ts >= $2 AND ts <= $3
		 ORDER BY ts ASC`,
		table,
	)
	rows, err := s.pool.Query(ctx, query, symbol, from, to)
	if err != nil {
		return nil, fmt.Errorf("query candles: %w", err)
	}
	defer rows.Close()

	var result []model.Candlestick
	for rows.Next() {
		var c model.Candlestick
		if err := rows.Scan(&c.Ts, &c.Symbol, &c.Open, &c.High, &c.Low, &c.Close, &c.Volume, &c.QuoteVolume); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}
