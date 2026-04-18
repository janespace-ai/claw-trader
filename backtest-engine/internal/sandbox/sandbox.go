package sandbox

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"

	"github.com/janespace-ai/claw-trader/backtest-engine/internal/config"
)

// Manager talks to the Docker daemon to create and destroy sandbox containers.
type Manager struct {
	cfg config.SandboxConfig
	ro  config.ReadonlyConfig
	cli *client.Client
}

// New constructs a Manager by connecting to the local Docker daemon.
func New(cfg config.SandboxConfig, ro config.ReadonlyConfig) (*Manager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("docker client: %w", err)
	}
	return &Manager{cfg: cfg, ro: ro, cli: cli}, nil
}

// Close releases the docker client.
func (m *Manager) Close() error {
	if m.cli != nil {
		return m.cli.Close()
	}
	return nil
}

// Job is the payload written to /workspace/job.json inside the sandbox.
type Job struct {
	TaskID      string         `json:"task_id"`
	Mode        string         `json:"mode"`         // 'backtest' | 'screener'
	Code        string         `json:"code"`         // user Python code
	Config      map[string]any `json:"config"`       // backtest or screener config
	CallbackURL string         `json:"callback_url"` // e.g. http://claw-backtest-engine:8081
	DB          DBInfo         `json:"db"`
}

// DBInfo gives the sandbox the readonly DB connection info.
type DBInfo struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// LaunchParams are the runtime inputs to Launch.
type LaunchParams struct {
	TaskID string
	Job    Job // Config already marshaled into map
}

// Launch creates and starts a sandbox container that will pick up the job,
// hit the callback URL with progress/complete/error, and exit.
// Returns the container ID; caller should monitor via Monitor() and then Cleanup().
func (m *Manager) Launch(ctx context.Context, p LaunchParams) (string, error) {
	name := "claw-sandbox-" + p.TaskID

	jobJSON, err := json.Marshal(p.Job)
	if err != nil {
		return "", fmt.Errorf("marshal job: %w", err)
	}

	// Resource limits
	memBytes := int64(m.cfg.MemoryMB) * 1024 * 1024
	nanoCPUs := int64(m.cfg.CPUCores) * 1_000_000_000
	pidsLimit := int64(m.cfg.PidsLimit)

	// Host config: read-only root, tmpfs /workspace, no network access besides claw-sandbox-net
	hostCfg := &container.HostConfig{
		AutoRemove:     false, // we cleanup manually so logs are inspectable if needed
		ReadonlyRootfs: true,
		Tmpfs: map[string]string{
			"/workspace": fmt.Sprintf("rw,noexec,nosuid,size=%dm",
				maxOr(m.cfg.WorkspaceSizeMB, 64)),
			"/tmp": "rw,noexec,nosuid,size=32m",
		},
		Resources: container.Resources{
			Memory:    memBytes,
			NanoCPUs:  nanoCPUs,
			PidsLimit: &pidsLimit,
		},
		SecurityOpt: []string{"no-new-privileges"},
		CapDrop:     []string{"ALL"},
		// Timeout-based stop is driven by Monitor(), not docker's StopTimeout.
	}

	// Attach only to the sandbox network (internal Docker network with DB + callback).
	netCfg := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			m.cfg.Network: {},
		},
	}

	containerCfg := &container.Config{
		Image: m.cfg.Image,
		Cmd:   []string{"python3", "-u", "-m", "runner"},
		Env: []string{
			"PYTHONDONTWRITEBYTECODE=1",
			"PYTHONUNBUFFERED=1",
			"CLAW_JOB_JSON=" + string(jobJSON),
		},
		WorkingDir:   "/workspace",
		AttachStdout: false,
		AttachStderr: false,
		Tty:          false,
		// No published ports.
		ExposedPorts: nat.PortSet{},
	}

	created, err := m.cli.ContainerCreate(ctx, containerCfg, hostCfg, netCfg, nil, name)
	if err != nil {
		return "", fmt.Errorf("create container: %w", err)
	}

	if err := m.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		_ = m.cli.ContainerRemove(ctx, created.ID, container.RemoveOptions{Force: true})
		return "", fmt.Errorf("start container: %w", err)
	}
	log.Printf("[sandbox] launched container=%s task=%s", created.ID[:12], p.TaskID)
	return created.ID, nil
}

// Monitor blocks until the container exits or the timeout elapses, whichever comes first.
// Returns the exit code or an error. On timeout, forcibly kills the container.
func (m *Manager) Monitor(ctx context.Context, containerID string) (int64, error) {
	timeout := time.Duration(m.cfg.TimeoutSec) * time.Second
	deadline := time.Now().Add(timeout)

	waitCtx, cancel := context.WithDeadline(ctx, deadline)
	defer cancel()

	statusCh, errCh := m.cli.ContainerWait(waitCtx, containerID, container.WaitConditionNotRunning)

	select {
	case err := <-errCh:
		// Timeout or docker error — kill the container.
		if ctx.Err() == nil && waitCtx.Err() != nil {
			log.Printf("[sandbox] container=%s exceeded timeout=%s, killing", containerID[:12], timeout)
			_ = m.Kill(context.Background(), containerID)
			return -1, fmt.Errorf("sandbox execution timeout after %s", timeout)
		}
		return -1, err
	case status := <-statusCh:
		if status.Error != nil {
			return status.StatusCode, fmt.Errorf("%s", status.Error.Message)
		}
		return status.StatusCode, nil
	}
}

// Kill forcibly stops a container, ignoring errors from already-dead containers.
func (m *Manager) Kill(ctx context.Context, containerID string) error {
	return m.cli.ContainerKill(ctx, containerID, "SIGKILL")
}

// Cleanup removes a container. Safe to call after Monitor returns.
func (m *Manager) Cleanup(ctx context.Context, containerID string) error {
	delay := time.Duration(m.cfg.CleanupDelaySec) * time.Second
	if delay > 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
	return m.cli.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true})
}

// Logs grabs the tail of a sandbox container's stdout/stderr, useful for error reporting.
func (m *Manager) Logs(ctx context.Context, containerID string, tail int) (string, error) {
	opts := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       strconv.Itoa(tail),
	}
	rc, err := m.cli.ContainerLogs(ctx, containerID, opts)
	if err != nil {
		return "", err
	}
	defer rc.Close()

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(rc); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// EnsureNetwork creates the sandbox Docker network if missing. Idempotent.
func (m *Manager) EnsureNetwork(ctx context.Context) error {
	nets, err := m.cli.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return err
	}
	for _, n := range nets {
		if n.Name == m.cfg.Network {
			return nil
		}
	}
	_, err = m.cli.NetworkCreate(ctx, m.cfg.Network, network.CreateOptions{
		Driver:   "bridge",
		Internal: true,
	})
	return err
}

func maxOr(v, fallback int) int {
	if v <= 0 {
		return fallback
	}
	return v
}
