package compliance

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"

	"github.com/janespace-ai/claw-trader/service-api/internal/config"
)

//go:embed ast_checker.py
var astCheckerSource []byte

// Violation is a single policy breach found in user code.
type Violation struct {
	Rule    string `json:"rule"`
	Line    int    `json:"line"`
	Message string `json:"message"`
}

// Verdict is the overall result of AST inspection.
type Verdict struct {
	OK     bool        `json:"ok"`
	Errors []Violation `json:"errors"`
}

// Checker runs the embedded Python AST analyzer against user code.
// The analyzer is invoked via `python3` and receives the policy as argv[1]
// and source code on stdin.
type Checker struct {
	cfg        config.ComplianceConfig
	pythonPath string // resolved python3 executable on host
	scriptPath string // temp file where embedded script is written on first use
}

// New creates a Checker. Call Close() to release the temp script.
func New(cfg config.ComplianceConfig) (*Checker, error) {
	py, err := resolvePython()
	if err != nil {
		return nil, err
	}
	tmp, err := os.CreateTemp("", "claw-ast-checker-*.py")
	if err != nil {
		return nil, fmt.Errorf("tempfile: %w", err)
	}
	if _, err := tmp.Write(astCheckerSource); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return nil, fmt.Errorf("write script: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return nil, err
	}
	return &Checker{cfg: cfg, pythonPath: py, scriptPath: tmp.Name()}, nil
}

// Close removes the temp script.
func (c *Checker) Close() error {
	if c.scriptPath == "" {
		return nil
	}
	return os.Remove(c.scriptPath)
}

// Check runs the analyzer on the supplied source. Returns (verdict, nil) in normal
// execution (including a failing verdict); only returns error for infrastructure failures.
func (c *Checker) Check(ctx context.Context, source string) (Verdict, error) {
	policyJSON, err := json.Marshal(map[string]any{
		"module_whitelist":   c.cfg.ModuleWhitelist,
		"forbidden_modules":  c.cfg.ForbiddenModules,
		"forbidden_builtins": c.cfg.ForbiddenBuiltins,
	})
	if err != nil {
		return Verdict{}, fmt.Errorf("marshal policy: %w", err)
	}

	cmd := exec.CommandContext(ctx, c.pythonPath, c.scriptPath, string(policyJSON))
	cmd.Stdin = bytes.NewReader([]byte(source))

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return Verdict{}, fmt.Errorf("ast_checker run (stderr=%q): %w", stderr.String(), err)
	}

	var v Verdict
	if err := json.Unmarshal(stdout.Bytes(), &v); err != nil {
		return Verdict{}, fmt.Errorf("decode verdict: %w (raw=%q)", err, stdout.String())
	}
	return v, nil
}

// resolvePython finds a usable python3 binary; prefers python3, falls back to python.
func resolvePython() (string, error) {
	for _, name := range []string{"python3", "python"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("python3 not found on PATH; compliance checker requires python3")
}
