# Sandbox image for executing user-submitted Python strategy/screener code.
FROM python:3.11-slim-bookworm

# ta-lib: requires native C library AND gcc for the Python wrapper wheel.
# Install build deps, compile the C library, symlink legacy names, install all
# Python deps (the ta-lib wrapper compiles from source here), then purge the
# build deps — all in a single layer so gcc doesn't bloat the final image.
COPY requirements.txt /tmp/requirements.txt
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
    # ta-lib 0.6.x installs libta-lib.{so,a} (hyphen), but the Python wrapper
    # (ta-lib==0.4.32 from PyPI, pinned in requirements.txt) still links
    # against -lta_lib (underscore). Add the legacy-name symlinks so ld finds
    # the library during wheel compilation.
    ln -sf libta-lib.so /usr/lib/libta_lib.so; \
    ln -sf libta-lib.a  /usr/lib/libta_lib.a; \
    cd /; rm -rf /tmp/ta-lib*; \
    # pip install runs BEFORE purging build-essential because the ta-lib
    # wheel compiles C against the library we just installed.
    pip install --no-cache-dir -r /tmp/requirements.txt; \
    rm /tmp/requirements.txt; \
    apt-get purge -y --auto-remove build-essential wget; \
    rm -rf /var/lib/apt/lists/*

# Bundled Python framework — user code imports `from claw.strategy import Strategy`.
COPY framework /opt/claw-framework
ENV PYTHONPATH=/opt/claw-framework

# runner.py lives at the root of the framework and is invoked via `python -m runner`.
RUN addgroup --system sandbox && adduser --system --ingroup sandbox --uid 10003 sandbox

USER sandbox
WORKDIR /workspace
ENTRYPOINT []
CMD ["python3", "-u", "-m", "runner"]
