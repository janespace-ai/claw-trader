package store_test

import (
	"context"
	"testing"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/testdb"
)

func TestCreateStrategy_CreatesV1Atomically(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	id, err := st.CreateStrategy(ctx, model.Strategy{
		Name:     "Momentum",
		CodeType: model.CodeTypeStrategy,
		Code:     "def strategy(ctx): pass",
		ParamsSchema: map[string]any{
			"ema_fast": 20,
			"ema_slow": 50,
		},
	})
	if err != nil {
		t.Fatalf("CreateStrategy: %v", err)
	}
	if id == "" {
		t.Fatal("expected non-empty id")
	}

	versions, err := st.ListStrategyVersions(ctx, id, 10)
	if err != nil {
		t.Fatalf("ListStrategyVersions: %v", err)
	}
	if len(versions) != 1 {
		t.Fatalf("expected 1 version, got %d", len(versions))
	}
	if versions[0].Version != 1 {
		t.Errorf("version = %d, want 1", versions[0].Version)
	}
	if versions[0].Code != "def strategy(ctx): pass" {
		t.Errorf("code mismatch: %q", versions[0].Code)
	}
	if versions[0].ParamsSchema["ema_fast"] != float64(20) {
		t.Errorf("params_schema did not roundtrip: %v", versions[0].ParamsSchema)
	}
}

func TestCreateStrategyVersion_AdvancesCurrentVersion(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	id, err := st.CreateStrategy(ctx, model.Strategy{
		Name: "Base", CodeType: model.CodeTypeStrategy, Code: "v1 code",
	})
	if err != nil {
		t.Fatalf("CreateStrategy: %v", err)
	}

	v2, err := st.CreateStrategyVersion(ctx, id, "v2 code", "second", nil, nil)
	if err != nil {
		t.Fatalf("CreateStrategyVersion v2: %v", err)
	}
	if v2.Version != 2 {
		t.Errorf("new version = %d, want 2", v2.Version)
	}

	// GetStrategy should now reflect v2.
	s, ok, err := st.GetStrategy(ctx, id)
	if err != nil || !ok {
		t.Fatalf("GetStrategy: err=%v ok=%v", err, ok)
	}
	if s.CurrentVersion != 2 {
		t.Errorf("current_version = %d, want 2", s.CurrentVersion)
	}
	if s.Code != "v2 code" {
		t.Errorf("joined code = %q, want 'v2 code'", s.Code)
	}
}

func TestCreateStrategyVersion_RejectsBadParentVersion(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	id, err := st.CreateStrategy(ctx, model.Strategy{
		Name: "X", CodeType: model.CodeTypeStrategy, Code: "v1",
	})
	if err != nil {
		t.Fatal(err)
	}
	bogus := 99
	_, err = st.CreateStrategyVersion(ctx, id, "code", "s", nil, &bogus)
	if err == nil {
		t.Fatal("expected error for bogus parent_version, got nil")
	}
}

func TestGetStrategyVersion_MissingReturnsOkFalse(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	id, err := st.CreateStrategy(ctx, model.Strategy{
		Name: "X", CodeType: model.CodeTypeStrategy, Code: "v1",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, ok, err := st.GetStrategyVersion(ctx, id, 42)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("expected ok=false for missing version")
	}
}

func TestListStrategyVersions_OrderNewestFirst(t *testing.T) {
	st := testdb.New(t)
	ctx := context.Background()

	id, err := st.CreateStrategy(ctx, model.Strategy{
		Name: "X", CodeType: model.CodeTypeStrategy, Code: "v1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateStrategyVersion(ctx, id, "v2", "", nil, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := st.CreateStrategyVersion(ctx, id, "v3", "", nil, nil); err != nil {
		t.Fatal(err)
	}
	vs, err := st.ListStrategyVersions(ctx, id, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(vs) != 3 {
		t.Fatalf("expected 3 versions, got %d", len(vs))
	}
	if vs[0].Version != 3 || vs[1].Version != 2 || vs[2].Version != 1 {
		t.Errorf("not newest-first: %+v", vs)
	}
}
