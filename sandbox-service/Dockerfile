# claw-sandbox-service — long-lived Python sandbox with prefork worker pool.
#
# All deps are pure-Python or ship as manylinux wheels (numpy, pandas,
# psycopg-binary), so we don't need build-essential or any compile step.
# Build time: ~2-3 minutes (was ~25 minutes when ta-lib was compiled from
# source).  ta-lib was dropped in commit drop-talib-from-sandbox — claw's
# indicators module is implemented in numpy/pandas directly; bring ta-lib
# back via a manylinux wheel (ta-lib>=0.5) when actually needed.
FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ---- Python deps (single layer; pure wheels so no build tools needed) ----
COPY pyproject.toml /app/pyproject.toml
RUN set -eux; \
    pip install --upgrade pip; \
    pip install /app

# ---- App source ----
COPY src /app/src
COPY config.yaml /app/config.yaml

# Mount point for on-disk callback queue; compose can override with a named volume.
RUN mkdir -p /var/lib/claw-sandbox

# Non-root runtime user.
RUN addgroup --system sandbox && \
    adduser --system --ingroup sandbox --uid 10003 sandbox && \
    chown -R sandbox:sandbox /var/lib/claw-sandbox /app
USER sandbox

ENV PYTHONPATH=/app/src
EXPOSE 8090

# Master process owns the HTTP server AND the prefork pool lifecycle.
# uvicorn is invoked from within api.main so we can do our own fork dance.
CMD ["python", "-m", "api.main"]

# Healthcheck — docker-compose consumers can rely on this instead of wiring
# their own probe.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request, sys; \
req = urllib.request.Request('http://127.0.0.1:8090/healthz'); \
sys.exit(0 if urllib.request.urlopen(req, timeout=2).status == 200 else 1)"
