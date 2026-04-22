"""FastAPI HTTP layer for sandbox-service.

Endpoints (all authenticated only by being on the internal Docker network —
``claw-sandbox-net`` is marked ``internal: true``):

    POST /run               — enqueue a job onto the pool
    GET  /status/{job_id}   — poll bookkeeping-table status
    GET  /healthz           — aggregate worker-pool health

Lifecycle:

    startup  → parse config, bring up Master (forks N workers), install
               signal handlers.
    shutdown → drain Master (SIGTERM → workers finish in-flight → 60 s grace
               → kill).

Why one file:

    The app is tiny.  Splitting routers is busywork while there's only three
    endpoints and no auth middleware.  If we grow to 10+ endpoints or need
    versioning, break this up into ``api/routes/``.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from api.config import load as load_config
from api.logging import setup as setup_logging
from api.schema import HealthResponse, RunRequest, RunResponse, StatusResponse
from pool.config import Settings
from pool.master import Master
from pool.messages import JobMsg


log = logging.getLogger("sandbox.api")


# ---- App factory ------------------------------------------------------------


def build_app(settings: Settings | None = None) -> FastAPI:
    """Construct the FastAPI app.  Kept as a factory for tests."""
    if settings is None:
        settings = load_config(os.environ.get("SANDBOX_CONFIG", "config.yaml"))
    setup_logging(settings.logging.level, settings.logging.format)

    master = Master(
        pool_cfg=settings.pool,
        job_limits=settings.job_limits,
        callback_cfg=settings.callback,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        log.info({"event": "api_startup", "port": settings.http.port})
        master.start()
        # Only the main thread can install signal handlers; uvicorn runs us
        # on the main thread so this is safe in prod.  Tests build the app
        # without starting uvicorn and skip this branch.
        try:
            master.install_signal_handlers()
        except ValueError:
            # ``signal only works in main thread`` — happens when FastAPI
            # TestClient spins the app in a worker thread.
            log.debug({"event": "api_signal_handlers_skipped"})
        try:
            yield
        finally:
            log.info({"event": "api_shutdown"})
            master.shutdown()

    app = FastAPI(
        title="claw sandbox-service",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.master = master
    app.state.settings = settings

    _register_routes(app, settings)
    return app


# ---- Routes -----------------------------------------------------------------


def _register_routes(app: FastAPI, settings: Settings) -> None:
    allowlist = set(settings.callback.allowlist_hosts)

    @app.post("/run", response_model=RunResponse, status_code=202)
    def post_run(req: RunRequest) -> RunResponse:
        # Defend in depth: backtest-engine already picks the URL, but if its
        # config is misconfigured we don't want to call out to a random host.
        host = urlparse(str(req.callback_base_url)).hostname or ""
        if host not in allowlist:
            log.warning({
                "event": "run_rejected_callback_host",
                "job_id": req.job_id, "host": host,
            })
            raise HTTPException(
                status_code=400,
                detail={"code": "CALLBACK_HOST_NOT_ALLOWED",
                        "message": f"callback host {host!r} not in allowlist"},
            )

        master: Master = app.state.master
        if not master.is_running():
            raise HTTPException(
                status_code=503,
                detail={"code": "SHUTTING_DOWN",
                        "message": "service is shutting down; not accepting new jobs"},
            )

        try:
            master.submit(JobMsg(
                job_id=req.job_id,
                task_id=req.task_id,
                mode=req.mode,
                code=req.code,
                config=req.config,
                callback_base_url=str(req.callback_base_url),
                db_host=req.db.host,
                db_port=req.db.port,
                db_user=req.db.user,
                db_password=req.db.password,
                db_name=req.db.name,
            ))
        except RuntimeError as exc:
            raise HTTPException(
                status_code=503,
                detail={"code": "SHUTTING_DOWN", "message": str(exc)},
            ) from exc

        log.info({
            "event": "run_accepted",
            "job_id": req.job_id, "task_id": req.task_id, "mode": req.mode,
        })
        return RunResponse(job_id=req.job_id, status="queued")

    @app.get("/status/{job_id}", response_model=StatusResponse)
    def get_status(job_id: str) -> StatusResponse:
        master: Master = app.state.master
        st = master.status(job_id)
        if st is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": f"job {job_id!r} unknown or expired"},
            )
        return StatusResponse(
            job_id=st.job_id,
            status=st.status,  # type: ignore[arg-type]
            worker_id=st.worker_id,
            queued_at=st.queued_at,
            started_at=st.started_at,
            finished_at=st.finished_at,
            error=st.error,
        )

    @app.get("/healthz")
    def get_healthz() -> JSONResponse:
        master: Master = app.state.master
        ready, total = master.workers_ready()
        shutting = not master.is_running()
        expected = settings.pool.pool_size
        # "healthy" = pool is up to size and not shutting down.  Not-yet-booted
        # also returns 503 so k8s/docker health wait until workers finish warmup.
        is_healthy = (not shutting) and ready >= expected
        body = HealthResponse(
            ready=is_healthy,
            workers_ready=ready,
            workers_total=total,
            shutting_down=shutting,
        ).model_dump()
        return JSONResponse(status_code=200 if is_healthy else 503, content=body)


# ---- Entry point ------------------------------------------------------------


def main() -> None:
    """``python -m api.main`` — the Dockerfile CMD."""
    import uvicorn  # noqa: PLC0415

    settings = load_config(os.environ.get("SANDBOX_CONFIG", "config.yaml"))
    setup_logging(settings.logging.level, settings.logging.format)
    app = build_app(settings)

    # uvicorn installs its own SIGTERM/SIGINT handlers that trigger graceful
    # shutdown — which in turn runs our lifespan `finally` block.  That's where
    # Master.shutdown() is called, so we don't need to duplicate handling here.
    uvicorn.run(
        app,
        host=settings.http.host,
        port=settings.http.port,
        log_config=None,     # we already installed our JSON formatter
        access_log=False,    # access logs drowning job logs is not useful
    )


if __name__ == "__main__":  # pragma: no cover
    main()
