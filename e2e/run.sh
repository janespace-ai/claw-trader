#!/usr/bin/env bash
#
# End-to-end smoke test: from zero to data-in-hand.
#
# 1. Bring up a fresh Timescale + data-aggregator using the *test*
#    config (config.test.yaml: top_symbols=2, months_back=2, ~60s cycle).
# 2. Wait for the aggregator boot pipeline to finish.
# 3. Bring up backtest-engine.
# 4. Hit /api/symbols and /api/klines on :8081 — real Gate.io data
#    populated by the aggregator, served by the gateway.
# 5. Tear everything down.
#
# Not invoked by `make test` — it's slow (downloads real S3 CSVs),
# stateful (blows away DB), and needs network egress to gateio.ws.
# Run with `make test-e2e`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGG_DIR="$ROOT/data-aggregator"
BE_DIR="$ROOT/backtest-engine"

PIPELINE_TIMEOUT_SEC=${PIPELINE_TIMEOUT_SEC:-300}

cleanup() {
  echo "---- teardown ----"
  docker compose -f "$BE_DIR/docker-compose.yml" down -v --remove-orphans 2>/dev/null || true
  docker compose -f "$AGG_DIR/docker-compose.yml" \
                 -f "$AGG_DIR/docker-compose.test.yml" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (brew install jq)" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

echo "---- bringing up timescale + aggregator (test config) ----"
docker compose -f "$AGG_DIR/docker-compose.yml" \
               -f "$AGG_DIR/docker-compose.test.yml" up -d --build

echo "---- waiting for aggregator pipeline to finish (timeout ${PIPELINE_TIMEOUT_SEC}s) ----"
elapsed=0
while (( elapsed < PIPELINE_TIMEOUT_SEC )); do
  if docker logs claw-data-aggregator 2>&1 | grep -q "finished status=done"; then
    echo "boot pipeline finished after ${elapsed}s"
    break
  fi
  sleep 5
  elapsed=$(( elapsed + 5 ))
done
if (( elapsed >= PIPELINE_TIMEOUT_SEC )); then
  echo "aggregator did not finish in ${PIPELINE_TIMEOUT_SEC}s" >&2
  docker logs --tail 80 claw-data-aggregator
  exit 1
fi

echo "---- bringing up backtest-engine ----"
docker compose -f "$BE_DIR/docker-compose.yml" up -d --build

# Poll /healthz on 8081 until backtest-engine answers.
echo "---- waiting for backtest-engine /healthz ----"
for i in $(seq 1 60); do
  if curl -fsS http://localhost:8081/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS http://localhost:8081/healthz >/dev/null 2>&1; then
  echo "backtest-engine did not become healthy" >&2
  docker logs --tail 60 claw-backtest-engine
  exit 1
fi

echo "---- assertion: GET /api/symbols returns >= 2 rows ----"
sym_count=$(curl -fsS "http://localhost:8081/api/symbols?limit=2" | jq '. | length')
if [[ "$sym_count" -lt 2 ]]; then
  echo "expected >=2 symbols, got $sym_count" >&2
  exit 1
fi

symbol=$(curl -fsS "http://localhost:8081/api/symbols?limit=1" | jq -r '.[0].symbol')
echo "first symbol = $symbol"

from_unix=$(date -u -v-7d +%s 2>/dev/null || date -u -d '7 days ago' +%s)
to_unix=$(date -u +%s)

echo "---- assertion: GET /api/klines returns data for $symbol ----"
kl_count=$(curl -fsS "http://localhost:8081/api/klines?symbol=$symbol&interval=1h&from=$from_unix&to=$to_unix" | jq '. | length')
if [[ "$kl_count" -lt 1 ]]; then
  echo "expected >=1 kline for $symbol, got $kl_count" >&2
  exit 1
fi
echo "klines returned: $kl_count"

echo "---- E2E PASS ----"
