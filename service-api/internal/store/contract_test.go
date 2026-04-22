package store_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/janespace-ai/claw-trader/service-api/internal/store"
	"github.com/janespace-ai/claw-trader/service-api/internal/testdb"
)

// aggregatorMigrationsDir is the location of the committed aggregator
// migration snapshot. It is relative to this test file (Go sets CWD
// to the package directory for each package's tests).
const aggregatorMigrationsDir = "../testdb/testdata/aggregator-migrations"
const checksumsFile = "CHECKSUMS"

// TestAggregatorMigrationsInSync verifies the committed copy of
// aggregator migrations matches the current source-of-truth files,
// by computing sha256 of each .sql file and comparing against the
// committed CHECKSUMS manifest. If this fails, run:
//   make sync-aggregator-migrations
// at the repo root to re-sync the snapshot.
func TestAggregatorMigrationsInSync(t *testing.T) {
	expected := readChecksums(t, filepath.Join(aggregatorMigrationsDir, checksumsFile))

	got := map[string]string{}
	entries, err := os.ReadDir(aggregatorMigrationsDir)
	if err != nil {
		t.Fatalf("read migrations dir: %v", err)
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		p := filepath.Join(aggregatorMigrationsDir, e.Name())
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("read %s: %v", p, err)
		}
		sum := sha256.Sum256(b)
		got[e.Name()] = hex.EncodeToString(sum[:])
	}

	if len(got) != len(expected) {
		t.Errorf("file count mismatch: committed %d entries in CHECKSUMS, found %d .sql files on disk",
			len(expected), len(got))
	}

	var problems []string
	for name, gotHash := range got {
		if want, ok := expected[name]; !ok {
			problems = append(problems, "missing from CHECKSUMS: "+name)
		} else if want != gotHash {
			problems = append(problems, "hash drift: "+name)
		}
	}
	for name := range expected {
		if _, ok := got[name]; !ok {
			problems = append(problems, "CHECKSUMS lists missing file: "+name)
		}
	}
	if len(problems) > 0 {
		sort.Strings(problems)
		t.Fatalf("aggregator migration snapshot is out of sync:\n  %s\n\nRun `make sync-aggregator-migrations` at repo root to re-sync.",
			strings.Join(problems, "\n  "))
	}
}

func readChecksums(t *testing.T, path string) map[string]string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read CHECKSUMS: %v", err)
	}
	out := map[string]string{}
	for _, line := range strings.Split(strings.TrimSpace(string(b)), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Format: "<sha256>  <filename>" (shasum style)
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		// Path can be "./001_x.sql" or "001_x.sql" depending on tool.
		name := filepath.Base(parts[len(parts)-1])
		out[name] = parts[0]
	}
	return out
}

// TestGatewayQueriesAgainstAggregatorSchema is the substantive half of
// flagship #2: with the aggregator migrations applied to the test
// schema (handled by testdb.New), every gateway store method must
// execute without column-shape errors.
func TestGatewayQueriesAgainstAggregatorSchema(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	// QueryKlines for each supported interval — each maps to a
	// claw.futures_<interval> hypertable created by aggregator migration 001.
	for _, iv := range store.SupportedIntervals {
		t.Run("klines_"+iv, func(t *testing.T) {
			_, err := st.QueryKlines(ctx, "futures", iv, "NONEXISTENT", time.Unix(0, 0), time.Now())
			if err != nil {
				t.Errorf("QueryKlines(%s): %v", iv, err)
			}
		})
	}

	// Symbols / gaps tables come from aggregator migration 002.
	if _, err := st.ListActiveSymbols(ctx, "futures", 1); err != nil {
		t.Errorf("ListActiveSymbols: %v", err)
	}
	if _, err := st.QueryGaps(ctx, store.GapFilter{Limit: 1}); err != nil {
		t.Errorf("QueryGaps: %v", err)
	}
}
