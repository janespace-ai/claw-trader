// Package testdb mirrors data-aggregator/internal/testdb for backtest-engine.
// It opens a pool against CLAW_TEST_DSN, creates a `test_<hex>` schema,
// runs backtest-engine's migrations against it, and registers a cleanup
// that drops the schema on test teardown.
package testdb

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
)

const envDSN = "CLAW_TEST_DSN"
const SchemaPrefix = "test_"

// New returns a Store pointed at a fresh per-test schema.
func New(t *testing.T) *store.Store {
	t.Helper()

	dsn := os.Getenv(envDSN)
	if dsn == "" {
		t.Skipf("skipping DB-backed test: set %s=postgres://... to enable", envDSN)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}

	schema := newSchemaName()
	if _, err := pool.Exec(ctx, fmt.Sprintf(`CREATE SCHEMA %s`, quoteIdent(schema))); err != nil {
		pool.Close()
		t.Fatalf("create schema %q: %v", schema, err)
	}

	s := store.NewFromPool(pool, schema)
	if err := s.Migrate(ctx); err != nil {
		dropSchema(ctx, pool, schema)
		pool.Close()
		t.Fatalf("migrate schema %q: %v", schema, err)
	}

	t.Cleanup(func() {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel2()
		dropSchema(ctx2, pool, schema)
		pool.Close()
	})

	return s
}

// Reap drops orphaned `test_*` schemas. Used by `make db-reap`.
func Reap(ctx context.Context, pool *pgxpool.Pool, maxAge time.Duration) (int, error) {
	cutoff := time.Now().Add(-maxAge)

	rows, err := pool.Query(ctx, `
		SELECT schema_name
		FROM information_schema.schemata
		WHERE schema_name LIKE $1
	`, SchemaPrefix+"%")
	if err != nil {
		return 0, fmt.Errorf("list schemas: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return 0, err
		}
		names = append(names, n)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	dropped := 0
	for _, name := range names {
		if maxAge > 0 {
			var youngest *time.Time
			err := pool.QueryRow(ctx, `
				SELECT MAX(greatest(stat.last_vacuum, stat.last_autovacuum, stat.last_analyze, stat.last_autoanalyze))
				FROM pg_stat_all_tables stat
				JOIN pg_class c ON c.oid = stat.relid
				JOIN pg_namespace n ON n.oid = c.relnamespace
				WHERE n.nspname = $1
			`, name).Scan(&youngest)
			if err == nil && youngest != nil && youngest.After(cutoff) {
				continue
			}
		}
		if err := dropSchema(ctx, pool, name); err != nil {
			continue
		}
		dropped++
	}
	return dropped, nil
}

func newSchemaName() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%s%d", SchemaPrefix, time.Now().UnixNano())
	}
	return SchemaPrefix + hex.EncodeToString(b)
}

func dropSchema(ctx context.Context, pool *pgxpool.Pool, name string) error {
	_, err := pool.Exec(ctx, fmt.Sprintf(`DROP SCHEMA IF EXISTS %s CASCADE`, quoteIdent(name)))
	return err
}

func quoteIdent(name string) string {
	out := `"`
	for _, c := range name {
		if c == '"' {
			out += `""`
		} else {
			out += string(c)
		}
	}
	out += `"`
	return out
}

// OpenPool opens a pool using CLAW_TEST_DSN. Used by `make db-reap`.
func OpenPool(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := os.Getenv(envDSN)
	if dsn == "" {
		return nil, fmt.Errorf("%s is not set", envDSN)
	}
	return pgxpool.New(ctx, dsn)
}
