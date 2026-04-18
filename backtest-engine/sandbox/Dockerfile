# Sandbox image for executing user-submitted Python strategy/screener code.
FROM python:3.11-slim-bookworm

# ta-lib: requires native C library. Install build deps, compile, then strip.
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
    cd /; rm -rf /tmp/ta-lib*; \
    apt-get purge -y --auto-remove build-essential wget; \
    rm -rf /var/lib/apt/lists/*

# Python dependencies (psycopg2-binary avoids needing libpq-dev at runtime).
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Bundled Python framework — user code imports `from claw.strategy import Strategy`.
COPY framework /opt/claw-framework
ENV PYTHONPATH=/opt/claw-framework

# runner.py lives at the root of the framework and is invoked via `python -m runner`.
RUN addgroup --system sandbox && adduser --system --ingroup sandbox --uid 10003 sandbox

USER sandbox
WORKDIR /workspace
ENTRYPOINT []
CMD ["python3", "-u", "-m", "runner"]
