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

type SandboxConfig struct {
	Image           string   `yaml:"image"`
	Network         string   `yaml:"network"`
	CallbackBase    string   `yaml:"callback_base"`
	MemoryMB        int      `yaml:"memory_mb"`
	CPUCores        int      `yaml:"cpu_cores"`
	PidsLimit       int      `yaml:"pids_limit"`
	TimeoutSec      int      `yaml:"timeout_sec"`
	WorkspaceSizeMB int      `yaml:"workspace_size_mb"`
	CleanupDelaySec int      `yaml:"cleanup_delay_sec"`
	AllowedHosts    []string `yaml:"allowed_hosts"`
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
	setStr("BACKTEST_SANDBOX_IMAGE", &cfg.Sandbox.Image)
	setStr("BACKTEST_SANDBOX_NETWORK", &cfg.Sandbox.Network)
	setStr("BACKTEST_CALLBACK_BASE", &cfg.Sandbox.CallbackBase)
	setInt("BACKTEST_SERVER_PORT", &cfg.Server.Port)
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
	if c.Sandbox.Image == "" {
		missing = append(missing, "sandbox.image")
	}
	if c.Database.Schema == "" {
		c.Database.Schema = "claw"
	}
	if c.Sandbox.MemoryMB <= 0 {
		c.Sandbox.MemoryMB = 2048
	}
	if c.Sandbox.CPUCores <= 0 {
		c.Sandbox.CPUCores = 2
	}
	if c.Sandbox.PidsLimit <= 0 {
		c.Sandbox.PidsLimit = 100
	}
	if c.Sandbox.TimeoutSec <= 0 {
		c.Sandbox.TimeoutSec = 1800
	}
	if c.Backtest.MaxOptimizationRuns <= 0 {
		c.Backtest.MaxOptimizationRuns = 100
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required config: %s", strings.Join(missing, ", "))
	}
	return nil
}
