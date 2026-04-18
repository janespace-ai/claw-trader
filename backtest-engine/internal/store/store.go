package store

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"text/template"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/config"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/model"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store encapsulates the pg pool + schema for backtest-engine.
type Store struct {
	pool   *pgxpool.Pool
	schema string
}

// New opens a connection pool and pings the DB.
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
		return nil, fmt.Errorf("ping: %w", err)
	}
	return NewFromPool(pool, cfg.Schema), nil
}

// NewFromPool wraps an already-open pool with an explicit schema name.
// Exposed for tests that want to inject an isolated schema.
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

// Schema returns the configured schema name. Useful for tests that want
// to run raw SQL against the store's schema.
func (s *Store) Schema() string { return s.schema }

// Migrate applies every SQL file under migrations/ in filename order.
//
// Each file is rendered through text/template with {"Schema": s.schema}
// before execution, so `{{.Schema}}` placeholders resolve to the configured
// schema name (production: "claw", tests: a disposable per-suite schema).
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

// ---------------- Strategy CRUD ----------------

// CreateStrategy inserts a new strategy row and returns the assigned ID.
func (s *Store) CreateStrategy(ctx context.Context, st model.Strategy) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO claw.strategies (name, code_type, code, params_schema)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, st.Name, st.CodeType, st.Code, marshalJSONB(st.ParamsSchema)).Scan(&id)
	return id, err
}

// GetStrategy reads by ID, returning ok=false if missing.
func (s *Store) GetStrategy(ctx context.Context, id string) (model.Strategy, bool, error) {
	const sql = `
		SELECT id, name, code_type, code, COALESCE(params_schema, '{}'::jsonb),
		       created_at, updated_at
		FROM claw.strategies WHERE id = $1
	`
	var st model.Strategy
	var params []byte
	err := s.pool.QueryRow(ctx, sql, id).Scan(
		&st.ID, &st.Name, &st.CodeType, &st.Code, &params,
		&st.CreatedAt, &st.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return model.Strategy{}, false, nil
		}
		return model.Strategy{}, false, err
	}
	_ = json.Unmarshal(params, &st.ParamsSchema)
	return st, true, nil
}

// ListStrategies returns the N most recent strategies, optionally filtered by type.
func (s *Store) ListStrategies(ctx context.Context, codeType string, limit int) ([]model.Strategy, error) {
	if limit <= 0 {
		limit = 50
	}
	args := []any{limit}
	where := ""
	if codeType != "" {
		args = append(args, codeType)
		where = fmt.Sprintf(" WHERE code_type = $%d", len(args))
	}
	sql := fmt.Sprintf(`
		SELECT id, name, code_type, code, COALESCE(params_schema, '{}'::jsonb),
		       created_at, updated_at
		FROM claw.strategies%s
		ORDER BY created_at DESC
		LIMIT $1
	`, where)

	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []model.Strategy{}
	for rows.Next() {
		var st model.Strategy
		var params []byte
		if err := rows.Scan(&st.ID, &st.Name, &st.CodeType, &st.Code,
			&params, &st.CreatedAt, &st.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(params, &st.ParamsSchema)
		result = append(result, st)
	}
	return result, rows.Err()
}

// ---------------- BacktestRun CRUD ----------------

// CreateBacktestRun inserts a new run row in "pending" state.
func (s *Store) CreateBacktestRun(ctx context.Context, run model.BacktestRun) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO claw.backtest_runs (strategy_id, status, mode, config)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, run.StrategyID, run.Status, run.Mode, run.Config).Scan(&id)
	return id, err
}

// UpdateBacktestStatus sets status + optional started/finished timestamps.
func (s *Store) UpdateBacktestStatus(ctx context.Context, id, status string, startedAt, finishedAt *time.Time, errMsg string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE claw.backtest_runs
		SET status = $2,
		    started_at  = COALESCE($3, started_at),
		    finished_at = COALESCE($4, finished_at),
		    error       = NULLIF($5, '')
		WHERE id = $1
	`, id, status, startedAt, finishedAt, errMsg)
	return err
}

// UpdateBacktestProgress merges a progress JSON payload.
func (s *Store) UpdateBacktestProgress(ctx context.Context, id string, progress any) error {
	raw, err := json.Marshal(progress)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE claw.backtest_runs SET progress = $2 WHERE id = $1`,
		id, raw,
	)
	return err
}

// UpdateBacktestResult stores the final result JSON and marks the run as done.
func (s *Store) UpdateBacktestResult(ctx context.Context, id string, result any) error {
	raw, err := json.Marshal(result)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx, `
		UPDATE claw.backtest_runs
		SET result = $2,
		    status = 'done',
		    finished_at = $3
		WHERE id = $1
	`, id, raw, now)
	return err
}

// GetBacktestRun reads by ID.
func (s *Store) GetBacktestRun(ctx context.Context, id string) (model.BacktestRun, bool, error) {
	const sql = `
		SELECT id, strategy_id, status, mode, config,
		       COALESCE(progress, '{}'::jsonb),
		       COALESCE(result,   'null'::jsonb),
		       COALESCE(error, ''),
		       started_at, finished_at, created_at
		FROM claw.backtest_runs WHERE id = $1
	`
	var run model.BacktestRun
	err := s.pool.QueryRow(ctx, sql, id).Scan(
		&run.ID, &run.StrategyID, &run.Status, &run.Mode, &run.Config,
		&run.Progress, &run.Result, &run.Error,
		&run.StartedAt, &run.FinishedAt, &run.CreatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return model.BacktestRun{}, false, nil
		}
		return model.BacktestRun{}, false, err
	}
	return run, true, nil
}

// ListBacktestRuns returns recent runs, optionally scoped to a strategy.
func (s *Store) ListBacktestRuns(ctx context.Context, strategyID string, limit int) ([]model.BacktestRun, error) {
	if limit <= 0 {
		limit = 50
	}
	args := []any{limit}
	where := ""
	if strategyID != "" {
		args = append(args, strategyID)
		where = fmt.Sprintf(" WHERE strategy_id = $%d", len(args))
	}
	sql := fmt.Sprintf(`
		SELECT id, strategy_id, status, mode, config,
		       COALESCE(progress, '{}'::jsonb),
		       COALESCE(result,   'null'::jsonb),
		       COALESCE(error, ''),
		       started_at, finished_at, created_at
		FROM claw.backtest_runs%s
		ORDER BY created_at DESC
		LIMIT $1
	`, where)
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []model.BacktestRun{}
	for rows.Next() {
		var run model.BacktestRun
		if err := rows.Scan(&run.ID, &run.StrategyID, &run.Status, &run.Mode, &run.Config,
			&run.Progress, &run.Result, &run.Error,
			&run.StartedAt, &run.FinishedAt, &run.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, run)
	}
	return result, rows.Err()
}

// HasRunningBacktest returns true if any backtest run is currently in 'running' state.
func (s *Store) HasRunningBacktest(ctx context.Context) (bool, string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM claw.backtest_runs WHERE status = 'running' LIMIT 1`,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return false, "", nil
		}
		return false, "", err
	}
	return true, id, nil
}

// ---------------- ScreenerRun CRUD ----------------

// CreateScreenerRun inserts a screener task row.
func (s *Store) CreateScreenerRun(ctx context.Context, run model.ScreenerRun) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO claw.screener_runs (strategy_id, status, config)
		VALUES ($1, $2, $3)
		RETURNING id
	`, run.StrategyID, run.Status, run.Config).Scan(&id)
	return id, err
}

// UpdateScreenerStatus updates status + timestamps.
func (s *Store) UpdateScreenerStatus(ctx context.Context, id, status string, startedAt, finishedAt *time.Time, errMsg string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE claw.screener_runs
		SET status = $2,
		    started_at  = COALESCE($3, started_at),
		    finished_at = COALESCE($4, finished_at),
		    error       = NULLIF($5, '')
		WHERE id = $1
	`, id, status, startedAt, finishedAt, errMsg)
	return err
}

// UpdateScreenerResult stores the final result JSON and marks the run done.
func (s *Store) UpdateScreenerResult(ctx context.Context, id string, result any) error {
	raw, err := json.Marshal(result)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx, `
		UPDATE claw.screener_runs
		SET result = $2,
		    status = 'done',
		    finished_at = $3
		WHERE id = $1
	`, id, raw, now)
	return err
}

// GetScreenerRun reads by ID.
func (s *Store) GetScreenerRun(ctx context.Context, id string) (model.ScreenerRun, bool, error) {
	const sql = `
		SELECT id, strategy_id, status, config,
		       COALESCE(result, 'null'::jsonb),
		       COALESCE(error, ''),
		       started_at, finished_at, created_at
		FROM claw.screener_runs WHERE id = $1
	`
	var run model.ScreenerRun
	err := s.pool.QueryRow(ctx, sql, id).Scan(
		&run.ID, &run.StrategyID, &run.Status, &run.Config,
		&run.Result, &run.Error,
		&run.StartedAt, &run.FinishedAt, &run.CreatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return model.ScreenerRun{}, false, nil
		}
		return model.ScreenerRun{}, false, err
	}
	return run, true, nil
}

// marshalJSONB converts an interface to JSONB-compatible bytes (null-safe).
func marshalJSONB(v any) []byte {
	if v == nil {
		return []byte("null")
	}
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("null")
	}
	return b
}

// Suppress unused pgx import if no raw use.
var _ = pgx.Identifier{}
