package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config is the root application configuration.
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Gateio   GateioConfig   `yaml:"gateio"`
	Sync     SyncConfig     `yaml:"sync"`
	Gap      GapConfig      `yaml:"gap"`
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

// DSN returns a libpq-compatible DSN usable with pgx.
func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable",
		d.User, d.Password, d.Host, d.Port, d.Name)
}

type GateioConfig struct {
	S3BaseURL         string `yaml:"s3_base_url"`
	S3PathTemplate    string `yaml:"s3_path_template"`
	APIBaseURL        string `yaml:"api_base_url"`
	TickersEndpoint   string `yaml:"tickers_endpoint"`
	CandlesEndpoint   string `yaml:"candles_endpoint"`
	RateLimitPerSec   int    `yaml:"rate_limit_per_sec"`
	RequestTimeoutSec int    `yaml:"request_timeout_sec"`
}

type SyncConfig struct {
	TopSymbols          int      `yaml:"top_symbols"`
	Concurrency         int      `yaml:"concurrency"`
	MaxRetry            int      `yaml:"max_retry"`
	RetryBackoffSec     int      `yaml:"retry_backoff_sec"`
	S3Intervals         []string `yaml:"s3_intervals"`
	AggregatedIntervals []string `yaml:"aggregated_intervals"`
	APIIntervals        []string `yaml:"api_intervals"`
	MonthsBack          int      `yaml:"months_back"`
}

type GapConfig struct {
	ThresholdMultiplier float64           `yaml:"threshold_multiplier"`
	MaxRetryPerGap      int               `yaml:"max_retry_per_gap"`
	SkipOnFailure       bool              `yaml:"skip_on_failure"`
	MaxGapAgeDays       int               `yaml:"max_gap_age_days"`
	MinCompleteness     float64           `yaml:"min_completeness"`
	ExcludedSymbols     []string          `yaml:"excluded_symbols"`
	ExcludedRanges      []ExcludedRange   `yaml:"excluded_ranges"`
}

type ExcludedRange struct {
	Symbol string `yaml:"symbol"`
	From   string `yaml:"from"`
	To     string `yaml:"to"`
	Reason string `yaml:"reason"`
}

// Load reads YAML from path then applies environment variable overrides.
// Environment override format: DATA_AGGREGATOR_<SECTION>_<KEY> (e.g. DATA_AGGREGATOR_DATABASE_HOST).
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
	if v := os.Getenv("DATA_AGGREGATOR_DATABASE_HOST"); v != "" {
		cfg.Database.Host = v
	}
	if v := os.Getenv("DATA_AGGREGATOR_DATABASE_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.Database.Port = p
		}
	}
	if v := os.Getenv("DATA_AGGREGATOR_DATABASE_USER"); v != "" {
		cfg.Database.User = v
	}
	if v := os.Getenv("DATA_AGGREGATOR_DATABASE_PASSWORD"); v != "" {
		cfg.Database.Password = v
	}
	if v := os.Getenv("DATA_AGGREGATOR_DATABASE_NAME"); v != "" {
		cfg.Database.Name = v
	}
	if v := os.Getenv("DATA_AGGREGATOR_SERVER_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.Server.Port = p
		}
	}
}

// Validate checks that required fields are populated.
func (c *Config) Validate() error {
	var missing []string
	if c.Database.Host == "" {
		missing = append(missing, "database.host")
	}
	if c.Database.User == "" {
		missing = append(missing, "database.user")
	}
	if c.Database.Name == "" {
		missing = append(missing, "database.name")
	}
	if c.Database.Schema == "" {
		c.Database.Schema = "claw"
	}
	if c.Gateio.S3BaseURL == "" {
		missing = append(missing, "gateio.s3_base_url")
	}
	if c.Gateio.APIBaseURL == "" {
		missing = append(missing, "gateio.api_base_url")
	}
	if c.Sync.Concurrency <= 0 {
		c.Sync.Concurrency = 50
	}
	if c.Gateio.RateLimitPerSec <= 0 {
		c.Gateio.RateLimitPerSec = 180
	}
	if c.Gateio.RequestTimeoutSec <= 0 {
		c.Gateio.RequestTimeoutSec = 30
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required config: %s", strings.Join(missing, ", "))
	}
	return nil
}
