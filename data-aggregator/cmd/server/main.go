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
	log.Printf("data-aggregator starting")

	// 1. Load config (YAML + env overrides).
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	log.Printf("config loaded: db=%s:%d server=%s:%d",
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

	// 4. Hertz server.
	addr := fmt.Sprintf("%s:%d", cfg.Server.Address, cfg.Server.Port)
	h := server.New(
		server.WithHostPorts(addr),
		server.WithReadTimeout(30*time.Second),
		server.WithWriteTimeout(30*time.Second),
	)
	router.Register(h, st, syncSvc)

	go func() {
		log.Printf("HTTP server listening on %s", addr)
		h.Spin()
	}()

	// 5. Wait for signal.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("received signal: %v, shutting down", sig)
}
