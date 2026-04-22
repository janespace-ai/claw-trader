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

	"github.com/janespace-ai/claw-trader/service-api/internal/aireview"
	"github.com/janespace-ai/claw-trader/service-api/internal/compliance"
	"github.com/janespace-ai/claw-trader/service-api/internal/config"
	"github.com/janespace-ai/claw-trader/service-api/internal/router"
	"github.com/janespace-ai/claw-trader/service-api/internal/sandboxclient"
	"github.com/janespace-ai/claw-trader/service-api/internal/service"
	"github.com/janespace-ai/claw-trader/service-api/internal/store"
	"github.com/janespace-ai/claw-trader/service-api/internal/version"
)

func main() {
	var configPath string
	flag.StringVar(&configPath, "config", "config.yaml", "path to config.yaml")
	flag.Parse()

	// Capture process start so GET /api/engine/status can compute uptime.
	version.ProcessStartUnix = time.Now().Unix()

	log.SetFlags(log.LstdFlags | log.Lmicroseconds | log.Lshortfile)
	log.Printf("service-api starting (version=%s)", version.Version)

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	log.Printf("config loaded: db=%s:%d sandbox_service=%s", cfg.Database.Host, cfg.Database.Port, cfg.Sandbox.ServiceURL)

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

	// sandbox-service client.  The old per-task Docker launcher (internal/sandbox/)
	// has been removed; all job execution now flows through HTTP POST /run.
	sbox := sandboxclient.New(cfg.Sandbox.ServiceURL,
		time.Duration(cfg.Sandbox.TimeoutSec)*time.Second)
	// Best-effort readiness probe so we fail early if sandbox-service is down.
	// Non-fatal: the service-api can still start (e.g. for /api/klines),
	// submits will just get dispatch errors until sandbox-service is back.
	probeCtx, probeCancel := context.WithTimeout(ctx, 5*time.Second)
	if h, err := sbox.Healthz(probeCtx); err != nil {
		log.Printf("warning: sandbox-service not ready: %v", err)
	} else {
		log.Printf("sandbox-service ready: workers=%d/%d", h.WorkersReady, h.WorkersTotal)
	}
	probeCancel()

	// Gate 2 AI reviewer.  Always constructed — it's cheap and self-disables
	// when config.ai_review.enabled=false or the API key is missing.  Start()
	// runs a one-off model-drift cache purge; any error is logged but not fatal.
	air := aireview.NewService(cfg.AIReview, st.Pool(), cfg.Database.Schema)
	if err := air.Start(ctx); err != nil {
		log.Printf("warning: aireview start: %v", err)
	}
	log.Printf("ai_review: enabled=%v model=%s", air.Enabled(), cfg.AIReview.Model)

	// Services.
	bs := service.NewBacktestService(*cfg, st, cc, air, sbox)
	ss := service.NewScreenerService(*cfg, st, cc, air, sbox)
	as := service.NewAnalysisService(st)

	// Hertz server.
	addr := fmt.Sprintf("%s:%d", cfg.Server.Address, cfg.Server.Port)
	h := server.New(
		server.WithHostPorts(addr),
		server.WithReadTimeout(30*time.Second),
		server.WithWriteTimeout(30*time.Second),
	)
	router.Register(h, st, bs, ss, as)

	go func() {
		log.Printf("HTTP server listening on %s", addr)
		h.Spin()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("received signal: %v, shutting down", sig)
}
