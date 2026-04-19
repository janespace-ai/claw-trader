# syntax=docker/dockerfile:1

# --- Build stage ---
FROM golang:1.23-alpine AS builder

WORKDIR /src
# goproxy.cn 优先，避免国内/受限网络下 proxy.golang.org 超时
ENV GOPROXY=https://goproxy.cn,https://proxy.golang.org,direct

# Cache modules independently of source for faster rebuilds
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /out/data-aggregator ./cmd/server

# --- Runtime stage ---
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata wget && \
    adduser -D -u 10001 app

WORKDIR /app
COPY --from=builder /out/data-aggregator /app/data-aggregator
COPY internal/store/migrations /app/migrations
COPY config.yaml /app/config.yaml

USER app

EXPOSE 8080

ENTRYPOINT ["/app/data-aggregator"]
CMD ["-config", "/app/config.yaml"]
