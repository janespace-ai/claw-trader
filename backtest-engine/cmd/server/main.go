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

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/compliance"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/config"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/router"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/sandbox"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/service"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/store"
	"github.com/janespace-ai/claw-trader/backtest-engine/internal/version"
)

func main() {
	var configPath string
	flag.StringVar(&configPath, "config", "config.yaml", "path to config.yaml")
	flag.Parse()

	// Capture process start so GET /api/engine/status can compute uptime.
	version.ProcessStartUnix = time.Now().Unix()

	log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	log.Printf("backtest-engine starting (version=%s)", version.Version)

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	log.Printf("config loaded: db=%s:%d sandbox_image=%s", cfg.Database.Host, cfg.Database.Port, cfg.Sandbox.Image)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// DB connection + migrations.
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

	// Compliance checker (Python AST).
	cc, err := compliance.New(cfg.Compliance)
	if err != nil {
		log.Fatalf("compliance: %v", err)
	}
	defer cc.Close()

	// Sandbox manager (Docker).
	sm, err := sandbox.New(cfg.Sandbox, cfg.Readonly)
	if err != nil {
		log.Fatalf("sandbox: %v", err)
	}
	defer sm.Close()
	if err := sm.EnsureNetwork(ctx); err != nil {
		log.Printf("warning: could not ensure sandbox network %q: %v", cfg.Sandbox.Network, err)
	}

	// Services.
	bs := service.NewBacktestService(*cfg, st, cc, sm)
	ss := service.NewScreenerService(*cfg, st, cc, sm)

	// Hertz server.
	addr := fmt.Sprintf("%s:%d", cfg.Server.Address, cfg.Server.Port)
	h := server.New(
		server.WithHostPorts(addr),
		server.WithReadTimeout(30*time.Second),
		server.WithWriteTimeout(30*time.Second),
	)
	router.Register(h, st, bs, ss)

	go func() {
		log.Printf("HTTP server listening on %s", addr)
		h.Spin()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("received signal: %v, shutting down", sig)
}
