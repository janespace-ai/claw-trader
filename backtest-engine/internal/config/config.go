package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config is the root application configuration for backtest-engine.
type Config struct {
	Server     ServerConfig     `yaml:"server"`
	Database   DatabaseConfig   `yaml:"database"`
	Readonly   ReadonlyConfig   `yaml:"readonly"`
	Sandbox    SandboxConfig    `yaml:"sandbox"`
	Compliance ComplianceConfig `yaml:"compliance"`
	Backtest   BacktestConfig   `yaml:"backtest"`
	AIReview   AIReviewConfig   `yaml:"ai_review"`
}

type ServerConfig struct {
	Address string `yaml:"address"`
	Port    int    `yaml:"port"`
}

type DatabaseConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	Name     string `yaml:"name"`
	Schema   string `yaml:"schema"`
	MaxConns int    `yaml:"max_conns"`
	MinConns int    `yaml:"min_conns"`
}

func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable",
		d.User, d.Password, d.Host, d.Port, d.Name)
}

// ReadonlyConfig describes the DB credentials passed into sandbox containers.
type ReadonlyConfig struct {
	User     string `yaml:"user"`
	Password string `yaml:"password"`
}

// SandboxConfig configures the link to sandbox-service.
//
// Historical fields (Image/Network/MemoryMB/CPUCores/PidsLimit/
// WorkspaceSizeMB/CleanupDelaySec/AllowedHosts) lived here when backtest-engine
// launched its own Docker containers.  Those responsibilities now belong
// to sandbox-service, which reads them from its own config.yaml.  Only the
// fields that describe the dispatch endpoint remain.
type SandboxConfig struct {
	// ServiceURL is the base URL for sandbox-service, e.g. ``http://sandbox-service:8090``.
	ServiceURL string `yaml:"service_url"`
	// CallbackBase is the URL sandbox-service workers POST progress/complete/error to,
	// i.e. this engine's own public address on the internal network.  Included in
	// every /run request body.
	CallbackBase string `yaml:"callback_base"`
	// TimeoutSec is the per-request timeout for sandbox-service calls (/run,
	// /status, /healthz).  Not the user-code execution timeout — that's
	// enforced inside sandbox-service via rlimits.
	TimeoutSec int `yaml:"timeout_sec"`
}

// AIReviewConfig configures the Gate 2 LLM code reviewer.
//
// The Review service is fail-closed: any error (timeout, parse, network,
// non-approve verdict) becomes a rejection.  Disable only by setting
// Enabled=false explicitly.
type AIReviewConfig struct {
	Enabled         bool   `yaml:"enabled"`
	APIKey          string `yaml:"api_key"`           // DeepSeek API key; env DEEPSEEK_API_KEY wins
	BaseURL         string `yaml:"base_url"`          // default: https://api.deepseek.com
	Model           string `yaml:"model"`             // default: deepseek-reasoner
	TimeoutSeconds  int    `yaml:"timeout_seconds"`   // default: 30
	CacheTTLDays    int    `yaml:"cache_ttl_days"`    // default: 30
	PromptVersion   string `yaml:"prompt_version"`    // default: "v1"
}

type ComplianceConfig struct {
	ModuleWhitelist    []string `yaml:"module_whitelist"`
	ForbiddenBuiltins  []string `yaml:"forbidden_builtins"`
	ForbiddenModules   []string `yaml:"forbidden_modules"`
}

type BacktestConfig struct {
	MaxOptimizationRuns int `yaml:"max_optimization_runs"`
	DefaultLookbackDays int `yaml:"default_lookback_days"`
	PreviewLookbackDays int `yaml:"preview_lookback_days"`
}

// Load reads YAML from disk and applies env overrides (prefix BACKTEST_).
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	cfg := &Config{}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	applyEnvOverrides(cfg)
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}
	return cfg, nil
}

func applyEnvOverrides(cfg *Config) {
	setStr := func(env string, dst *string) {
		if v := os.Getenv(env); v != "" {
			*dst = v
		}
	}
	setInt := func(env string, dst *int) {
		if v := os.Getenv(env); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				*dst = n
			}
		}
	}
	setStr("BACKTEST_DATABASE_HOST", &cfg.Database.Host)
	setInt("BACKTEST_DATABASE_PORT", &cfg.Database.Port)
	setStr("BACKTEST_DATABASE_USER", &cfg.Database.User)
	setStr("BACKTEST_DATABASE_PASSWORD", &cfg.Database.Password)
	setStr("BACKTEST_DATABASE_NAME", &cfg.Database.Name)
	setStr("BACKTEST_READONLY_USER", &cfg.Readonly.User)
	setStr("BACKTEST_READONLY_PASSWORD", &cfg.Readonly.Password)
	setStr("BACKTEST_SANDBOX_SERVICE_URL", &cfg.Sandbox.ServiceURL)
	setStr("BACKTEST_CALLBACK_BASE", &cfg.Sandbox.CallbackBase)
	setInt("BACKTEST_SERVER_PORT", &cfg.Server.Port)
	// DEEPSEEK_API_KEY is the standard env name; BACKTEST_AI_REVIEW_API_KEY is
	// the fallback following our own convention.  Env always wins over YAML so
	// we never commit the key to config.yaml.
	if v := os.Getenv("DEEPSEEK_API_KEY"); v != "" {
		cfg.AIReview.APIKey = v
	}
	setStr("BACKTEST_AI_REVIEW_API_KEY", &cfg.AIReview.APIKey)
	setStr("BACKTEST_AI_REVIEW_BASE_URL", &cfg.AIReview.BaseURL)
	setStr("BACKTEST_AI_REVIEW_MODEL", &cfg.AIReview.Model)
	setInt("BACKTEST_AI_REVIEW_TIMEOUT_SECONDS", &cfg.AIReview.TimeoutSeconds)
	setInt("BACKTEST_AI_REVIEW_CACHE_TTL_DAYS", &cfg.AIReview.CacheTTLDays)
	if v := os.Getenv("BACKTEST_AI_REVIEW_ENABLED"); v != "" {
		cfg.AIReview.Enabled = v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
	}
}

func (c *Config) Validate() error {
	var missing []string
	if c.Database.Host == "" {
		missing = append(missing, "database.host")
	}
	if c.Database.User == "" {
		missing = append(missing, "database.user")
	}
	if c.Readonly.User == "" {
		missing = append(missing, "readonly.user")
	}
	if c.Sandbox.ServiceURL == "" {
		missing = append(missing, "sandbox.service_url")
	}
	if c.Database.Schema == "" {
		c.Database.Schema = "claw"
	}
	if c.Sandbox.TimeoutSec <= 0 {
		// 10 s default for /run, /status, /healthz.  NOT the user-code
		// execution timeout (that's inside sandbox-service via rlimits).
		c.Sandbox.TimeoutSec = 10
	}
	if c.Backtest.MaxOptimizationRuns <= 0 {
		c.Backtest.MaxOptimizationRuns = 100
	}
	// AI review defaults.  Note we do NOT require APIKey here even when
	// Enabled=true — the service checks for it at first call and rejects
	// fail-closed, which is the behavior we want (the operator can flip
	// Enabled on without a restart loop if the key gets misconfigured).
	if c.AIReview.BaseURL == "" {
		c.AIReview.BaseURL = "https://api.deepseek.com"
	}
	if c.AIReview.Model == "" {
		c.AIReview.Model = "deepseek-reasoner"
	}
	if c.AIReview.TimeoutSeconds <= 0 {
		c.AIReview.TimeoutSeconds = 30
	}
	if c.AIReview.CacheTTLDays <= 0 {
		c.AIReview.CacheTTLDays = 30
	}
	if c.AIReview.PromptVersion == "" {
		c.AIReview.PromptVersion = "v1"
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required config: %s", strings.Join(missing, ", "))
	}
	return nil
}
