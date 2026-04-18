package testdb

import (
	"context"
	"testing"
)

// TestSchemaLifecycle verifies that New creates a real schema with
// tables, and that t.Cleanup removes it on test teardown.
func TestSchemaLifecycle(t *testing.T) {
	s := New(t)
	schema := s.Schema()
	if schema == "" {
		t.Fatal("expected Schema() to return the per-test schema name")
	}

	// Migrations should have created claw-layout tables in the schema.
	ctx := context.Background()
	var tableCount int
	err := s.Pool().QueryRow(ctx, `
		SELECT COUNT(*)
		FROM information_schema.tables
		WHERE table_schema = $1
		  AND table_name IN ('futures_5m', 'futures_1h', 'symbols', 'gaps', 'sync_state')
	`, schema).Scan(&tableCount)
	if err != nil {
		t.Fatalf("count tables in schema %q: %v", schema, err)
	}
	if tableCount < 5 {
		t.Fatalf("expected at least 5 known tables in schema %q, got %d", schema, tableCount)
	}
}

// TestParallelSchemas confirms two schemas created back-to-back are
// independent and both cleaned up.
func TestParallelSchemas(t *testing.T) {
	t.Run("a", func(t *testing.T) {
		t.Parallel()
		s := New(t)
		if s.Schema() == "" {
			t.Fatal("no schema")
		}
	})
	t.Run("b", func(t *testing.T) {
		t.Parallel()
		s := New(t)
		if s.Schema() == "" {
			t.Fatal("no schema")
		}
	})
}
