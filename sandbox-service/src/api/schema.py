"""Pydantic request/response schemas for the HTTP layer.

Kept in one small module so generating an OpenAPI spec against the FastAPI app
stays trivial — there's no hidden cross-file inheritance.

Design notes:

- The body of ``POST /run`` is a thin envelope: we expect the caller
  (backtest-engine) to have already validated user code through Gate 1
  (AST) and Gate 2 (AI review).  sandbox-service does NOT re-review code.
- ``callback_base_url`` is validated against ``callback.allowlist_hosts``
  in the request handler, not here — pydantic can't see the config.
- All timestamps on the wire are unix epoch floats for simplicity; the log
  output uses RFC3339.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


# ---- POST /run --------------------------------------------------------------


class DBCredsIn(BaseModel):
    """Readonly DB credentials the worker will use to open a DBReader.

    The backtest-engine holds the real credentials in its config.  It forwards
    them per-job rather than sandbox-service reading them directly — keeps the
    sandbox unaware of where the data lives.
    """
    host: str
    port: int = 5432
    user: str
    password: str
    name: str


class RunRequest(BaseModel):
    """Body of ``POST /run``."""

    job_id: str = Field(..., min_length=1, max_length=64,
                        description="Caller-assigned unique id (usually task_id-{run_id})")
    task_id: str = Field(..., min_length=1, max_length=64)
    mode: Literal["backtest", "screener", "optimization"]
    code: str = Field(..., description="User Python source, already approved by Gate 1+2")
    config: dict[str, Any] = Field(default_factory=dict,
                                    description="Mode-specific config (date range, symbols, …)")
    callback_base_url: HttpUrl = Field(
        ...,
        description="Where to POST progress/complete/error. Host must be in allowlist.",
    )
    # DB creds are forwarded per-job so the sandbox never stores them.
    db: DBCredsIn


class RunResponse(BaseModel):
    job_id: str
    status: Literal["queued"] = "queued"


# ---- GET /status/{job_id} ---------------------------------------------------


class StatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "failed"]
    worker_id: int | None = None
    queued_at: float
    started_at: float | None = None
    finished_at: float | None = None
    error: str = ""


# ---- GET /healthz -----------------------------------------------------------


class HealthResponse(BaseModel):
    ready: bool
    workers_ready: int
    workers_total: int
    shutting_down: bool


__all__ = [
    "DBCredsIn",
    "HealthResponse",
    "RunRequest",
    "RunResponse",
    "StatusResponse",
]
