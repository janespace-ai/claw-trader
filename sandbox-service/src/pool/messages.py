"""Wire format for Master↔Worker control plane.

All messages are plain dicts serialized via ``multiprocessing.Queue`` pickling
— we keep them simple + typed so refactors don't silently break IPC.

Direction:
  Master → Worker: ``JobMsg`` (a job to run) or ``ShutdownMsg``
  Worker → Master: ``JobStartedMsg``, ``JobFinishedMsg``, ``WorkerRetiringMsg``
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ---- Master → Worker --------------------------------------------------------


@dataclass(slots=True, frozen=True)
class JobMsg:
    kind: str = "job"
    job_id: str = ""
    task_id: str = ""
    mode: str = "backtest"
    code: str = ""
    config: dict[str, Any] | None = None
    callback_base_url: str = ""
    # DB creds are passed each job (master reads from service config and forwards).
    db_host: str = ""
    db_port: int = 5432
    db_user: str = ""
    db_password: str = ""
    db_name: str = ""


@dataclass(slots=True, frozen=True)
class ShutdownMsg:
    """Master asks the worker to finish any in-flight job and exit cleanly."""
    kind: str = "shutdown"


# ---- Worker → Master --------------------------------------------------------


@dataclass(slots=True, frozen=True)
class JobStartedMsg:
    kind: str = "job_started"
    job_id: str = ""
    worker_id: int = 0


@dataclass(slots=True, frozen=True)
class JobFinishedMsg:
    kind: str = "job_finished"
    job_id: str = ""
    worker_id: int = 0
    ok: bool = True
    # On failure, a short reason string (user sees detail via callback instead).
    error: str = ""


@dataclass(slots=True, frozen=True)
class WorkerRetiringMsg:
    """Worker signalling it has completed `recycle_after_jobs` jobs and is exiting.

    Master uses this to pre-emptively fork a replacement so the pool stays at
    `pool_size`.
    """
    kind: str = "worker_retiring"
    worker_id: int = 0
    jobs_completed: int = 0
