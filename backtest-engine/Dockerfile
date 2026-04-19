# syntax=docker/dockerfile:1

# --- Build stage ---
FROM golang:1.25-alpine AS builder
WORKDIR /src
ENV GOPROXY=https://goproxy.cn,direct

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /out/backtest-engine ./cmd/server

# --- Runtime stage ---
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata docker-cli python3 && \
    adduser -D -u 10002 app

WORKDIR /app
COPY --from=builder /out/backtest-engine /app/backtest-engine
COPY internal/store/migrations /app/migrations
COPY config.yaml /app/config.yaml

# app user needs access to docker socket; host must grant group via docker-compose
USER app

EXPOSE 8081
ENTRYPOINT ["/app/backtest-engine"]
CMD ["-config", "/app/config.yaml"]
