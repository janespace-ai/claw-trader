#!/usr/bin/env bash
#
# Manually refresh the hand-written Gate.io golden fixtures used by
# offline tests under data-aggregator/internal/testfixtures/testdata/gateio/.
#
# This is NOT invoked by `make test`. Run it by hand when the Gate.io API
# or S3 CSV format changes and you want to re-capture live examples.
# Review the resulting diff carefully: stale assertions in fetcher tests
# may need updates.
#
# The script is intentionally small and honest about what it does —
# don't add 'jq' filters that silently mask fields; leave the raw
# responses so the next reader can see what Gate.io returned.
#
# Requires: curl, jq (for pretty-printing), gzip.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/data-aggregator/internal/testfixtures/testdata/gateio"
mkdir -p "$OUT"

GATEIO_API="https://api.gateio.ws/api/v4"

echo "--- tickers (first 3 contracts by volume_24h_quote) ---"
curl -sSf "$GATEIO_API/futures/usdt/tickers" \
  | jq 'sort_by(.volume_24h_quote | tonumber) | reverse | .[:3]' \
  > "$OUT/tickers_top3.json"
echo "wrote $OUT/tickers_top3.json"

echo "--- candles (BTC_USDT, 1h, last 7 bars) ---"
now=$(date -u +%s)
from=$((now - 7*3600))
curl -sSf "$GATEIO_API/futures/usdt/candlesticks?contract=BTC_USDT&interval=1h&from=$from&limit=7" \
  | jq . \
  > "$OUT/candles_BTC_USDT_1h.json"
echo "wrote $OUT/candles_BTC_USDT_1h.json"

echo
echo "Review the diff with: git diff $OUT"
echo "Any test assertions against exact values will need updating."
