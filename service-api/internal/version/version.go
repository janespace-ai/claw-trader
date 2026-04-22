// Package version exposes the injected build version string for
// service-api. Default value `"dev"` applies when run via
// `go run` / `go test`; container builds pass
// `-ldflags "-X .../version.Version=<git-describe>"` to replace it.
package version

// Version is set at build time via -ldflags. See Dockerfile.
var Version = "dev"

// ProcessStartUnix is the process-start timestamp used by
// `GET /api/engine/status` to compute uptime. Initialized from
// `cmd/server/main.go` during boot.
var ProcessStartUnix int64
