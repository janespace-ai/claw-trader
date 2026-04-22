# claw-sandbox-service — long-lived Python sandbox with prefork worker pool.
#
# Base image pattern mirrors service-api/sandbox/Dockerfile because we
# need the same native ta-lib compiled from source, and we want the same
# numpy/pandas/ta-lib ABI so user code behaves identically after migration.
FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ---- Native ta-lib + Python deps (single layer so build tools can be purged) ----
COPY pyproject.toml /app/pyproject.toml
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        build-essential wget ca-certificates; \
    cd /tmp; \
    wget -q https://github.com/TA-Lib/ta-lib/releases/download/v0.6.4/ta-lib-0.6.4-src.tar.gz; \
    tar xzf ta-lib-0.6.4-src.tar.gz; \
    cd ta-lib-0.6.4; \
    ./configure --prefix=/usr; \
    make -j"$(nproc)"; \
    make install; \
    # ta-lib 0.6.x ships libta-lib.{so,a} (hyphen); ta-lib==0.4.32 python wheel
    # still links -lta_lib (underscore). Symlink legacy names so the wrapper
    # wheel compiles (same workaround used in service-api sandbox image).
    ln -sf libta-lib.so /usr/lib/libta_lib.so; \
    ln -sf libta-lib.a  /usr/lib/libta_lib.a; \
    cd /; rm -rf /tmp/ta-lib*; \
    # Install service deps from pyproject.  Use pip's PEP 621 support.
    pip install --upgrade pip; \
    pip install /app; \
    apt-get purge -y --auto-remove build-essential wget; \
    rm -rf /var/lib/apt/lists/*

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
