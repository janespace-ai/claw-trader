package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cloudwego/hertz/pkg/app/server"

	"github.com/janespace-ai/claw-trader/data-aggregator/internal/config"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/router"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/service"
	"github.com/janespace-ai/claw-trader/data-aggregator/internal/store"
)

func main() {
	var configPath string
	flag.StringVar(&configPath, "config", "config.yaml", "path to config.yaml")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	log.Printf("data-aggregator starting (headless worker mode)")

	// 1. Load config (YAML + env overrides).
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	log.Printf("config loaded: db=%s:%d bind=%s:%d",
		cfg.Database.Host, cfg.Database.Port, cfg.Server.Address, cfg.Server.Port)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 2. DB connection + migrations.
	st, err := store.New(ctx, cfg.Database)
	if err != nil {
		log.Fatalf("store init: %v", err)
	}
	defer st.Close()

	migCtx, migCancel := context.WithTimeout(ctx, 2*time.Minute)
	defer migCancel()
	if err := st.Migrate(migCtx); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Printf("migrations applied")

	// 3. Sync orchestrator.
	syncSvc := service.NewSyncService(*cfg, st)

	// 4. Minimal HTTP server — only /healthz. Intended to bind to 127.0.0.1.
	addr := fmt.Sprintf("%s:%d", cfg.Server.Address, cfg.Server.Port)
	h := server.New(
		server.WithHostPorts(addr),
		server.WithReadTimeout(30*time.Second),
		server.WithWriteTimeout(30*time.Second),
	)
	router.Register(h)

	go func() {
		log.Printf("HTTP /healthz listening on %s", addr)
		h.Spin()
	}()

	// 5. Boot-time auto-sync. Runs in its own goroutine so /healthz is
	// available as soon as DB + migrations are ready. Cold-start downloads
	// may take hours; that is expected and MUST NOT block liveness.
	taskID := syncSvc.RunBoot(ctx)
	log.Printf("boot pipeline started task=%s (running in background)", taskID)

	// 6. Wait for signal. After boot catch-up completes, the process stays
	// alive (future WebSocket realtime work will live here).
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("received signal: %v, shutting down", sig)
}
