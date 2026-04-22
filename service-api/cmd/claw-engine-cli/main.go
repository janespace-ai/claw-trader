// claw-engine-cli — small operational helper for service-api.
//
// Subcommands:
//
//	ai-cache clear           Truncate claw.ai_review_cache.  Use when you
//	                         want every future submit to re-query DeepSeek
//	                         fresh without bumping the config model field
//	                         (which would also trigger a drift purge).
//
//	ai-cache stats           Print count + oldest/newest rows in the cache.
//
//	ai-cache purge-drift     Delete rows whose model != config.ai_review.model.
//	                         Runs automatically at server boot too, but handy
//	                         when you want to do it without a restart.
//
// Wiring: reads the same config.yaml the server reads (via -config) so the
// DB DSN stays in one place.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/janespace-ai/claw-trader/service-api/internal/aireview"
	"github.com/janespace-ai/claw-trader/service-api/internal/config"
)

func main() {
	var configPath string
	fs := flag.NewFlagSet("claw-engine-cli", flag.ExitOnError)
	fs.StringVar(&configPath, "config", "config.yaml", "path to config.yaml")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: claw-engine-cli [-config path] <command> [args...]")
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "commands:")
		fmt.Fprintln(os.Stderr, "  ai-cache clear         truncate claw.ai_review_cache")
		fmt.Fprintln(os.Stderr, "  ai-cache stats         print cache row counts + age")
		fmt.Fprintln(os.Stderr, "  ai-cache purge-drift   delete rows with stale model")
	}
	_ = fs.Parse(os.Args[1:])
	args := fs.Args()
	if len(args) < 1 {
		fs.Usage()
		os.Exit(2)
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load config: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.Database.DSN())
	if err != nil {
		fmt.Fprintf(os.Stderr, "pool: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	switch args[0] {
	case "ai-cache":
		if len(args) < 2 {
			fs.Usage()
			os.Exit(2)
		}
		if err := runAICache(ctx, pool, cfg, args[1]); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %q\n", args[0])
		fs.Usage()
		os.Exit(2)
	}
}

func runAICache(ctx context.Context, pool *pgxpool.Pool, cfg *config.Config, sub string) error {
	cache := aireview.NewCache(pool, cfg.Database.Schema, cfg.AIReview.CacheTTLDays)

	switch sub {
	case "clear":
		// Deliberate: a plain DELETE (not TRUNCATE) so we keep the schema
		// guarantees around statement triggers if we ever add any.  For the
		// row counts we have it makes no practical difference.
		tag, err := pool.Exec(ctx,
			fmt.Sprintf("DELETE FROM %s.ai_review_cache", cfg.Database.Schema))
		if err != nil {
			return fmt.Errorf("delete: %w", err)
		}
		fmt.Printf("cleared %d cache rows\n", tag.RowsAffected())
		return nil

	case "stats":
		var total int
		var oldest, newest *time.Time
		row := pool.QueryRow(ctx, fmt.Sprintf(`
			SELECT COUNT(*), MIN(created_at), MAX(created_at)
			FROM %s.ai_review_cache
		`, cfg.Database.Schema))
		if err := row.Scan(&total, &oldest, &newest); err != nil {
			return fmt.Errorf("stats: %w", err)
		}
		fmt.Printf("ai_review_cache: %d rows\n", total)
		if oldest != nil {
			fmt.Printf("  oldest: %s\n", oldest.Format(time.RFC3339))
		}
		if newest != nil {
			fmt.Printf("  newest: %s\n", newest.Format(time.RFC3339))
		}
		fmt.Printf("  current model: %s\n", cfg.AIReview.Model)
		return nil

	case "purge-drift":
		n, err := cache.PurgeModelDrift(ctx, cfg.AIReview.Model)
		if err != nil {
			return fmt.Errorf("purge: %w", err)
		}
		fmt.Printf("purged %d rows (model != %q)\n", n, cfg.AIReview.Model)
		return nil

	default:
		return fmt.Errorf("unknown ai-cache subcommand: %q", sub)
	}
}
