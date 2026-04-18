package testdb

import (
	"context"
	"testing"
)

func TestSchemaLifecycle(t *testing.T) {
	s := New(t)
	if s.Schema() == "" {
		t.Fatal("expected Schema() to return the per-test schema name")
	}

	ctx := context.Background()
	var n int
	err := s.Pool().QueryRow(ctx, `
		SELECT COUNT(*) FROM information_schema.tables
		WHERE table_schema = $1
		  AND table_name IN ('strategies', 'backtest_runs', 'screener_runs')
	`, s.Schema()).Scan(&n)
	if err != nil {
		t.Fatalf("count tables: %v", err)
	}
	if n != 3 {
		t.Fatalf("expected 3 backtest-engine tables in %q, got %d", s.Schema(), n)
	}
}
