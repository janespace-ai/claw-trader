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

	"github.com/janespace-ai/claw-trader/service-api/internal/config"
	"github.com/janespace-ai/claw-trader/service-api/internal/model"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store encapsulates the pg pool + schema for service-api.
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

// CreateStrategy inserts a new strategy row + an initial v1 version
// row atomically. Returns the assigned strategy ID.
//
// Post migration 003, `code` and `params_schema` live on
// `strategy_versions`; this helper writes both in one transaction so
// downstream code sees a consistent `current_version=1` record.
func (s *Store) CreateStrategy(ctx context.Context, st model.Strategy) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // best-effort on failure

	var id string
	sqlStr := fmt.Sprintf(`
		INSERT INTO %[1]s.strategies (name, code_type, current_version)
		VALUES ($1, $2, 1)
		RETURNING id
	`, s.schema)
	if err := tx.QueryRow(ctx, sqlStr, st.Name, st.CodeType).Scan(&id); err != nil {
		return "", err
	}

	sqlV := fmt.Sprintf(`
		INSERT INTO %[1]s.strategy_versions
			(strategy_id, version, code, summary, params_schema, parent_version)
		VALUES ($1, 1, $2, $3, $4, NULL)
	`, s.schema)
	if _, err := tx.Exec(ctx, sqlV, id, st.Code, "Initial version",
		marshalJSONB(st.ParamsSchema)); err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}

// GetStrategy reads by ID, joining `strategy_versions` for the row's
// current version to populate `Code` + `ParamsSchema`, and loading the
// post-migration-006 workspace + saved fields.
func (s *Store) GetStrategy(ctx context.Context, id string) (model.Strategy, bool, error) {
	sqlStr := fmt.Sprintf(`
		SELECT s.id, s.name, s.code_type, s.current_version,
		       v.code, COALESCE(v.params_schema, '{}'::jsonb),
		       s.created_at, s.updated_at,
		       s.draft_code, s.draft_symbols,
		       s.saved_code, s.saved_symbols, s.saved_at,
		       s.last_backtest, s.is_archived_draft
		FROM %[1]s.strategies s
		JOIN %[1]s.strategy_versions v
		  ON v.strategy_id = s.id AND v.version = s.current_version
		WHERE s.id = $1
	`, s.schema)
	var st model.Strategy
	var params []byte
	var draftSyms, savedSyms, lastBT []byte
	err := s.pool.QueryRow(ctx, sqlStr, id).Scan(
		&st.ID, &st.Name, &st.CodeType, &st.CurrentVersion,
		&st.Code, &params,
		&st.CreatedAt, &st.UpdatedAt,
		&st.DraftCode, &draftSyms,
		&st.SavedCode, &savedSyms, &st.SavedAt,
		&lastBT, &st.IsArchivedDraft,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return model.Strategy{}, false, nil
		}
		return model.Strategy{}, false, err
	}
	_ = json.Unmarshal(params, &st.ParamsSchema)
	if len(draftSyms) > 0 {
		_ = json.Unmarshal(draftSyms, &st.DraftSymbols)
	}
	if len(savedSyms) > 0 {
		_ = json.Unmarshal(savedSyms, &st.SavedSymbols)
	}
	if len(lastBT) > 0 && string(lastBT) != "null" {
		var lbt model.LastBacktestSummary
		if err := json.Unmarshal(lastBT, &lbt); err == nil {
			st.LastBacktest = &lbt
		}
	}
	return st, true, nil
}

// PatchStrategyDraft updates only draft_code / draft_symbols / last_backtest
// on an existing strategy.  saved_* fields are NOT touched — that path is
// reserved for SaveStrategy.  Any nil argument leaves the corresponding
// column unchanged.
func (s *Store) PatchStrategyDraft(ctx context.Context, id string,
	draftCode *string, draftSymbols *[]string, lastBacktest *model.LastBacktestSummary,
) error {
	sets := []string{"updated_at = now()"}
	args := []any{id}
	if draftCode != nil {
		args = append(args, *draftCode)
		sets = append(sets, fmt.Sprintf("draft_code = $%d", len(args)))
	}
	if draftSymbols != nil {
		b, _ := json.Marshal(*draftSymbols)
		args = append(args, b)
		sets = append(sets, fmt.Sprintf("draft_symbols = $%d::jsonb", len(args)))
	}
	if lastBacktest != nil {
		b, _ := json.Marshal(lastBacktest)
		args = append(args, b)
		sets = append(sets, fmt.Sprintf("last_backtest = $%d::jsonb", len(args)))
	}
	if len(sets) == 1 {
		// nothing to update
		return nil
	}
	sqlStr := fmt.Sprintf(`
		UPDATE %[1]s.strategies
		SET %[2]s
		WHERE id = $1
	`, s.schema, strings.Join(sets, ", "))
	_, err := s.pool.Exec(ctx, sqlStr, args...)
	return err
}

// SaveStrategy snapshots draft_code / draft_symbols into saved_*, sets
// saved_at = now(), and optionally updates the strategy name.  Atomic
// in a single UPDATE.
func (s *Store) SaveStrategy(ctx context.Context, id string, newName *string) error {
	sets := []string{
		"saved_code = draft_code",
		"saved_symbols = COALESCE(draft_symbols, '[]'::jsonb)",
		"saved_at = now()",
		"is_archived_draft = false",
		"updated_at = now()",
	}
	args := []any{id}
	if newName != nil {
		args = append(args, *newName)
		sets = append(sets, fmt.Sprintf("name = $%d", len(args)))
	}
	sqlStr := fmt.Sprintf(`
		UPDATE %[1]s.strategies
		SET %[2]s
		WHERE id = $1
	`, s.schema, strings.Join(sets, ", "))
	_, err := s.pool.Exec(ctx, sqlStr, args...)
	return err
}

// ArchiveStrategyDraft flips is_archived_draft=true.  Used when the user
// presses "+ 新建策略" while the active session is dirty — the previous
// session is preserved as a recoverable draft in the library.
func (s *Store) ArchiveStrategyDraft(ctx context.Context, id string) error {
	sqlStr := fmt.Sprintf(`
		UPDATE %[1]s.strategies
		SET is_archived_draft = true, updated_at = now()
		WHERE id = $1
	`, s.schema)
	_, err := s.pool.Exec(ctx, sqlStr, id)
	return err
}

// ListStrategies returns the N most recent strategies, joining each
// row with its current version's code/params_schema.
func (s *Store) ListStrategies(ctx context.Context, codeType string, limit int) ([]model.Strategy, error) {
	if limit <= 0 {
		limit = 50
	}
	args := []any{limit}
	where := ""
	if codeType != "" {
		args = append(args, codeType)
		where = fmt.Sprintf(" WHERE s.code_type = $%d", len(args))
	}
	sqlStr := fmt.Sprintf(`
		SELECT s.id, s.name, s.code_type, s.current_version,
		       v.code, COALESCE(v.params_schema, '{}'::jsonb),
		       s.created_at, s.updated_at,
		       s.draft_code, s.draft_symbols,
		       s.saved_code, s.saved_symbols, s.saved_at,
		       s.last_backtest, s.is_archived_draft
		FROM %[1]s.strategies s
		JOIN %[1]s.strategy_versions v
		  ON v.strategy_id = s.id AND v.version = s.current_version
		%[2]s
		ORDER BY s.updated_at DESC
		LIMIT $1
	`, s.schema, where)

	rows, err := s.pool.Query(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []model.Strategy{}
	for rows.Next() {
		var st model.Strategy
		var params, draftSyms, savedSyms, lastBT []byte
		if err := rows.Scan(&st.ID, &st.Name, &st.CodeType, &st.CurrentVersion,
			&st.Code, &params, &st.CreatedAt, &st.UpdatedAt,
			&st.DraftCode, &draftSyms,
			&st.SavedCode, &savedSyms, &st.SavedAt,
			&lastBT, &st.IsArchivedDraft); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(params, &st.ParamsSchema)
		if len(draftSyms) > 0 {
			_ = json.Unmarshal(draftSyms, &st.DraftSymbols)
		}
		if len(savedSyms) > 0 {
			_ = json.Unmarshal(savedSyms, &st.SavedSymbols)
		}
		if len(lastBT) > 0 && string(lastBT) != "null" {
			var lbt model.LastBacktestSummary
			if err := json.Unmarshal(lastBT, &lbt); err == nil {
				st.LastBacktest = &lbt
			}
		}
		result = append(result, st)
	}
	return result, rows.Err()
}

// ListStrategyVersions returns versions newest-first for a strategy.
func (s *Store) ListStrategyVersions(ctx context.Context, strategyID string, limit int) ([]model.StrategyVersion, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	sqlStr := fmt.Sprintf(`
		SELECT strategy_id, version, code, COALESCE(summary, ''),
		       COALESCE(params_schema, '{}'::jsonb),
		       parent_version, created_at
		FROM %[1]s.strategy_versions
		WHERE strategy_id = $1
		ORDER BY version DESC
		LIMIT $2
	`, s.schema)
	rows, err := s.pool.Query(ctx, sqlStr, strategyID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []model.StrategyVersion{}
	for rows.Next() {
		var v model.StrategyVersion
		var params []byte
		var createdAt time.Time
		if err := rows.Scan(&v.StrategyID, &v.Version, &v.Code, &v.Summary,
			&params, &v.ParentVersion, &createdAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(params, &v.ParamsSchema)
		v.CreatedAt = createdAt.Unix()
		result = append(result, v)
	}
	return result, rows.Err()
}

// GetStrategyVersion reads one specific version.
func (s *Store) GetStrategyVersion(ctx context.Context, strategyID string, version int) (model.StrategyVersion, bool, error) {
	sqlStr := fmt.Sprintf(`
		SELECT strategy_id, version, code, COALESCE(summary, ''),
		       COALESCE(params_schema, '{}'::jsonb),
		       parent_version, created_at
		FROM %[1]s.strategy_versions
		WHERE strategy_id = $1 AND version = $2
	`, s.schema)
	var v model.StrategyVersion
	var params []byte
	var createdAt time.Time
	err := s.pool.QueryRow(ctx, sqlStr, strategyID, version).Scan(
		&v.StrategyID, &v.Version, &v.Code, &v.Summary, &params,
		&v.ParentVersion, &createdAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return model.StrategyVersion{}, false, nil
		}
		return model.StrategyVersion{}, false, err
	}
	_ = json.Unmarshal(params, &v.ParamsSchema)
	v.CreatedAt = createdAt.Unix()
	return v, true, nil
}

// CreateStrategyVersion appends a new version and advances
// `strategies.current_version`. Takes a row-level lock to serialize
// concurrent appenders.
//
// Returns (0, STRATEGY_NOT_FOUND) if the strategy row doesn't exist.
// ParentVersion is validated to exist if non-nil.
func (s *Store) CreateStrategyVersion(ctx context.Context, strategyID string, code, summary string, paramsSchema map[string]any, parentVersion *int) (model.StrategyVersion, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return model.StrategyVersion{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Lock the strategies row to serialize concurrent appenders.
	var currentVersion int
	if err := tx.QueryRow(ctx, fmt.Sprintf(
		`SELECT current_version FROM %[1]s.strategies WHERE id = $1 FOR UPDATE`, s.schema,
	), strategyID).Scan(&currentVersion); err != nil {
		return model.StrategyVersion{}, err
	}

	// Validate parent_version if provided.
	if parentVersion != nil {
		var exists bool
		if err := tx.QueryRow(ctx, fmt.Sprintf(
			`SELECT EXISTS(SELECT 1 FROM %[1]s.strategy_versions WHERE strategy_id=$1 AND version=$2)`,
			s.schema,
		), strategyID, *parentVersion).Scan(&exists); err != nil {
			return model.StrategyVersion{}, err
		}
		if !exists {
			return model.StrategyVersion{}, fmt.Errorf("parent_version %d not found", *parentVersion)
		}
	}

	nextVersion := currentVersion + 1
	var createdAt time.Time
	if err := tx.QueryRow(ctx, fmt.Sprintf(`
		INSERT INTO %[1]s.strategy_versions
			(strategy_id, version, code, summary, params_schema, parent_version)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING created_at
	`, s.schema), strategyID, nextVersion, code, summary,
		marshalJSONB(paramsSchema), parentVersion).Scan(&createdAt); err != nil {
		return model.StrategyVersion{}, err
	}

	if _, err := tx.Exec(ctx, fmt.Sprintf(
		`UPDATE %[1]s.strategies SET current_version = $2, updated_at = now() WHERE id = $1`,
		s.schema,
	), strategyID, nextVersion); err != nil {
		return model.StrategyVersion{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.StrategyVersion{}, err
	}
	return model.StrategyVersion{
		StrategyID:    strategyID,
		Version:       nextVersion,
		Code:          code,
		Summary:       summary,
		ParamsSchema:  paramsSchema,
		ParentVersion: parentVersion,
		CreatedAt:     createdAt.Unix(),
	}, nil
}

// ---------------- BacktestRun CRUD ----------------

// CreateBacktestRun inserts a new run row in "pending" state.
func (s *Store) CreateBacktestRun(ctx context.Context, run model.BacktestRun) (string, error) {
	var id string
	sql := fmt.Sprintf(`
		INSERT INTO %[1]s.backtest_runs (strategy_id, status, mode, config)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, s.schema)
	err := s.pool.QueryRow(ctx, sql, run.StrategyID, run.Status, run.Mode, run.Config).Scan(&id)
	return id, err
}

// UpdateBacktestStatus sets status + optional started/finished timestamps.
func (s *Store) UpdateBacktestStatus(ctx context.Context, id, status string, startedAt, finishedAt *time.Time, errMsg string) error {
	sql := fmt.Sprintf(`
		UPDATE %[1]s.backtest_runs
		SET status = $2,
		    started_at  = COALESCE($3, started_at),
		    finished_at = COALESCE($4, finished_at),
		    error       = NULLIF($5, '')
		WHERE id = $1
	`, s.schema)
	_, err := s.pool.Exec(ctx, sql, id, status, startedAt, finishedAt, errMsg)
	return err
}

// UpdateBacktestProgress merges a progress JSON payload.
func (s *Store) UpdateBacktestProgress(ctx context.Context, id string, progress any) error {
	raw, err := json.Marshal(progress)
	if err != nil {
		return err
	}
	sql := fmt.Sprintf(`UPDATE %[1]s.backtest_runs SET progress = $2 WHERE id = $1`, s.schema)
	_, err = s.pool.Exec(ctx, sql, id, raw)
	return err
}

// UpdateBacktestResult stores the final result JSON and marks the run as done.
func (s *Store) UpdateBacktestResult(ctx context.Context, id string, result any) error {
	raw, err := json.Marshal(result)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	sql := fmt.Sprintf(`
		UPDATE %[1]s.backtest_runs
		SET result = $2,
		    status = 'done',
		    finished_at = $3
		WHERE id = $1
	`, s.schema)
	_, err = s.pool.Exec(ctx, sql, id, raw, now)
	return err
}

// GetBacktestRun reads by ID.
func (s *Store) GetBacktestRun(ctx context.Context, id string) (model.BacktestRun, bool, error) {
	sql := fmt.Sprintf(`
		SELECT id, strategy_id, status, mode, config,
		       COALESCE(progress, '{}'::jsonb),
		       COALESCE(result,   'null'::jsonb),
		       COALESCE(error, ''),
		       started_at, finished_at, created_at
		FROM %[1]s.backtest_runs WHERE id = $1
	`, s.schema)
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
		FROM %[1]s.backtest_runs%[2]s
		ORDER BY created_at DESC
		LIMIT $1
	`, s.schema, where)
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
	sql := fmt.Sprintf(`SELECT id FROM %[1]s.backtest_runs WHERE status = 'running' LIMIT 1`, s.schema)
	err := s.pool.QueryRow(ctx, sql).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return false, "", nil
		}
		return false, "", err
	}
	return true, id, nil
}

// CountRunningBacktests returns the number of backtest runs currently in
// 'running' state.  Used by `GET /api/engine/status` for `active_tasks`.
// With the long-lived sandbox-service, we no longer track in-flight jobs in
// process memory; the runs table is the source of truth.
func (s *Store) CountRunningBacktests(ctx context.Context) (int, error) {
	var n int
	sql := fmt.Sprintf(`SELECT COUNT(*) FROM %[1]s.backtest_runs WHERE status = 'running'`, s.schema)
	if err := s.pool.QueryRow(ctx, sql).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// ---------------- ScreenerRun CRUD ----------------

// CreateScreenerRun inserts a screener task row.
func (s *Store) CreateScreenerRun(ctx context.Context, run model.ScreenerRun) (string, error) {
	var id string
	sql := fmt.Sprintf(`
		INSERT INTO %[1]s.screener_runs (strategy_id, status, config)
		VALUES ($1, $2, $3)
		RETURNING id
	`, s.schema)
	err := s.pool.QueryRow(ctx, sql, run.StrategyID, run.Status, run.Config).Scan(&id)
	return id, err
}

// UpdateScreenerStatus updates status + timestamps.
func (s *Store) UpdateScreenerStatus(ctx context.Context, id, status string, startedAt, finishedAt *time.Time, errMsg string) error {
	sql := fmt.Sprintf(`
		UPDATE %[1]s.screener_runs
		SET status = $2,
		    started_at  = COALESCE($3, started_at),
		    finished_at = COALESCE($4, finished_at),
		    error       = NULLIF($5, '')
		WHERE id = $1
	`, s.schema)
	_, err := s.pool.Exec(ctx, sql, id, status, startedAt, finishedAt, errMsg)
	return err
}

// UpdateScreenerResult stores the final result JSON and marks the run done.
func (s *Store) UpdateScreenerResult(ctx context.Context, id string, result any) error {
	raw, err := json.Marshal(result)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	sql := fmt.Sprintf(`
		UPDATE %[1]s.screener_runs
		SET result = $2,
		    status = 'done',
		    finished_at = $3
		WHERE id = $1
	`, s.schema)
	_, err = s.pool.Exec(ctx, sql, id, raw, now)
	return err
}

// GetScreenerRun reads by ID.
func (s *Store) GetScreenerRun(ctx context.Context, id string) (model.ScreenerRun, bool, error) {
	sql := fmt.Sprintf(`
		SELECT id, strategy_id, status, config,
		       COALESCE(result, 'null'::jsonb),
		       COALESCE(error, ''),
		       started_at, finished_at, created_at
		FROM %[1]s.screener_runs WHERE id = $1
	`, s.schema)
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
