// Package testdb provides DB-backed test plumbing: it opens a pool against
// the Timescale pointed at by CLAW_TEST_DSN, creates a disposable
// per-test schema, runs the aggregator migrations against that schema,
// and registers a t.Cleanup that drops the schema after the test.
//
// Tests that do not need a DB should not import this package. Tests that
// do need a DB should call testdb.New(t) at the top of the test and use
// the returned Store normally.
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

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

// envDSN is the env var tests consult for a Timescale connection string.
// Example: postgres://claw:claw@localhost:5432/claw?sslmode=disable
const envDSN = "CLAW_TEST_DSN"

// SchemaPrefix is the prefix every test schema gets. Reap() will only
// drop schemas starting with this prefix, never touching production.
const SchemaPrefix = "test_"

// New returns a Store pointed at a fresh per-test schema. The schema is
// created, migrations are applied, and a cleanup is registered to
// DROP SCHEMA ... CASCADE when the test finishes.
//
// If CLAW_TEST_DSN is unset, the test is skipped with a clear message.
// This keeps `go test ./...` ergonomic on machines without Docker running.
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
		dropSchema(ctx, pool, schema) // best effort
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

// Reap drops orphaned `test_*` schemas older than maxAge. Intended to be
// called by `make db-reap` to clean up after panicked/killed test runs.
// Returns the number of schemas dropped.
func Reap(ctx context.Context, pool *pgxpool.Pool, maxAge time.Duration) (int, error) {
	cutoff := time.Now().Add(-maxAge)
	// pg_namespace doesn't record creation time; we use the id epoch of
	// the first object in the schema as a proxy. Simpler: rely on the
	// naming convention — schemas minted by New() live only during a
	// test run, so any `test_*` schema present at reap time is by
	// definition orphaned.
	//
	// We still honor maxAge by looking at pg_stat_all_tables.last_vacuum
	// / n_live_tup to detect stale ones, but for simplicity we drop any
	// test_* schema whose existence predates `cutoff` according to
	// pg_class.oid >> 32 being unavailable. Fallback: drop all test_*
	// schemas unconditionally if maxAge is zero.
	var rows [][]any
	query := `
		SELECT schema_name
		FROM information_schema.schemata
		WHERE schema_name LIKE $1
	`
	res, err := pool.Query(ctx, query, SchemaPrefix+"%")
	if err != nil {
		return 0, fmt.Errorf("list schemas: %w", err)
	}
	defer res.Close()
	for res.Next() {
		var name string
		if err := res.Scan(&name); err != nil {
			return 0, err
		}
		rows = append(rows, []any{name})
	}
	if err := res.Err(); err != nil {
		return 0, err
	}

	dropped := 0
	for _, r := range rows {
		name := r[0].(string)
		// age filter: if maxAge > 0, check the oldest object's ctid
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
				continue // schema has recent activity; leave it
			}
		}
		if err := dropSchema(ctx, pool, name); err != nil {
			// Don't abort whole reap on one failure.
			continue
		}
		dropped++
	}
	return dropped, nil
}

// newSchemaName returns a cryptographically random schema name like
// test_3f8a1c9d. Lowercase hex so it never needs quoting.
func newSchemaName() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		// Fall back to nanosecond entropy; collisions are negligible
		// and the caller is a test that would re-run anyway.
		return fmt.Sprintf("%s%d", SchemaPrefix, time.Now().UnixNano())
	}
	return SchemaPrefix + hex.EncodeToString(b)
}

// dropSchema drops a schema with CASCADE. Safe against nonexistent names.
func dropSchema(ctx context.Context, pool *pgxpool.Pool, name string) error {
	_, err := pool.Exec(ctx, fmt.Sprintf(`DROP SCHEMA IF EXISTS %s CASCADE`, quoteIdent(name)))
	return err
}

// quoteIdent double-quotes a Postgres identifier, escaping embedded quotes.
// Our schema names are ASCII hex so quoting is belt-and-braces.
func quoteIdent(name string) string {
	// No identifiers with double quotes are produced, but keep this
	// defensive: pg spec is to double any embedded quote.
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

// OpenPool is a small convenience for code paths that want their own pool
// (e.g. the Reap cmd target). Honors CLAW_TEST_DSN; panics if unset.
func OpenPool(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := os.Getenv(envDSN)
	if dsn == "" {
		return nil, fmt.Errorf("%s is not set", envDSN)
	}
	return pgxpool.New(ctx, dsn)
}
