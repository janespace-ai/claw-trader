"""Worker-process entrypoint.

Lifecycle:

1.  Master forks the process; ``worker_main`` is called in the child.
2.  Warm up: import the heavy libs (numpy / pandas / claw) so the first
    real job doesn't eat ~1 s of import time.
3.  Apply rlimits (memory / CPU / FSIZE) for the child process itself.
4.  Loop on the job queue:
      a.  pull a :class:`JobMsg` (or :class:`ShutdownMsg`),
      b.  run it via :func:`worker.job_runner.run_job`,
      c.  report ``job_started`` / ``job_finished`` to the Master,
      d.  if ``recycle_after_jobs`` reached: emit ``worker_retiring`` and exit.

The worker NEVER raises back to the caller — all failures route through the
callback channel via ``run_job`` so the Master stays oblivious to job content.

Note: we deliberately do NOT `os.fork()` per job.  Workers are long-lived;
rlimits are applied once at worker boot and cover every job the worker runs.
This is the "prefork" model (a la gunicorn) — not the "fork per request" one.
"""
from __future__ import annotations

import logging
import os
from dataclasses import replace
from multiprocessing import Queue
from pathlib import Path
from queue import Empty
from typing import Any

from pool.config import CallbackConfig, JobLimits
from pool.messages import (
    JobFinishedMsg,
    JobMsg,
    JobStartedMsg,
    ShutdownMsg,
    WorkerRetiringMsg,
)
from pool.rlimits import apply as apply_rlimits


log = logging.getLogger("sandbox.worker")


# Sentinel — queue.get returns this after the pool is torn down via poison pill.
# We use class identity rather than a string so no user code can forge it.
class _Poison:
    pass


def worker_main(
    worker_id: int,
    job_queue: "Queue[Any]",
    ctl_queue: "Queue[Any]",
    job_limits: JobLimits,
    callback_cfg: CallbackConfig,
    recycle_after_jobs: int,
) -> None:
    """Main loop of a worker child.  Returns (and exits) on retirement / shutdown."""
    # Logging is independent per process in forked children — reinstall handler.
    logging.basicConfig(
        level=logging.INFO, format="%(message)s", force=True,
    )

    log.info({"event": "worker_boot", "worker_id": worker_id, "pid": os.getpid()})

    _warmup()
    apply_rlimits(job_limits)

    # Deferred import — keeps the Master's startup free of claw framework IO
    # (framework in turn imports pandas; Master is not supposed to pay that cost).
    from callback.client import CallbackClient  # noqa: PLC0415
    from worker.job_runner import DBCreds, Job, run_job  # noqa: PLC0415

    # One SQLite file per worker: concurrent WAL/open on the same path from
    # multiple processes triggers sqlite3.OperationalError: disk I/O error on
    # typical container overlays.
    qpath = Path(callback_cfg.on_disk_queue_path)
    per_worker_cfg = replace(
        callback_cfg,
        on_disk_queue_path=str(qpath.parent / f"{qpath.stem}_w{worker_id}{qpath.suffix}"),
    )
    callback_client = CallbackClient(per_worker_cfg)
    jobs_done = 0

    while True:
        try:
            msg = job_queue.get(timeout=1.0)
        except Empty:
            continue

        if isinstance(msg, ShutdownMsg):
            log.info({"event": "worker_shutdown_ack", "worker_id": worker_id})
            return

        if not isinstance(msg, JobMsg):
            log.warning({"event": "worker_unknown_msg", "type": type(msg).__name__})
            continue

        # --- run the job ---
        ctl_queue.put(JobStartedMsg(job_id=msg.job_id, worker_id=worker_id))

        job = Job(
            job_id=msg.job_id,
            task_id=msg.task_id,
            mode=msg.mode,
            code=msg.code,
            config=msg.config or {},
            callback_base_url=msg.callback_base_url,
            db=DBCreds(
                host=msg.db_host, port=msg.db_port,
                user=msg.db_user, password=msg.db_password, name=msg.db_name,
            ),
        )

        ok = True
        err = ""
        try:
            run_job(
                job,
                post=lambda channel, payload: callback_client.post(
                    job.callback_base_url, channel, job.job_id, payload,
                ),
            )
        except Exception as exc:  # noqa: BLE001 — paranoid backstop
            # run_job already routes exceptions to the error callback channel;
            # this is a second-level safety net for truly unexpected failures
            # (e.g. callback client itself blowing up).
            ok = False
            err = f"{type(exc).__name__}: {exc}"
            log.exception({"event": "worker_run_job_uncaught", "job_id": job.job_id})

        ctl_queue.put(JobFinishedMsg(
            job_id=msg.job_id, worker_id=worker_id, ok=ok, error=err,
        ))
        jobs_done += 1

        # --- retirement ---
        if jobs_done >= recycle_after_jobs:
            log.info({
                "event": "worker_retiring",
                "worker_id": worker_id, "jobs_completed": jobs_done,
            })
            ctl_queue.put(WorkerRetiringMsg(worker_id=worker_id, jobs_completed=jobs_done))
            return


def _warmup() -> None:
    """Pre-import heavy deps so the first job doesn't pay the cold-import toll.

    ta-lib is intentionally NOT in the image — claw's indicators are pure
    numpy/pandas (see ``claw.indicators``).  If a future feature needs it,
    add ``ta-lib>=0.5`` (manylinux wheel) to ``pyproject.toml`` and restore
    the warmup here.
    """
    import importlib  # noqa: PLC0415

    for mod in ("numpy", "pandas"):
        importlib.import_module(mod)

    # claw framework itself — loading engine/data triggers the rest.
    for mod in ("claw", "claw.strategy", "claw.screener", "claw.engine", "claw.data"):
        try:
            importlib.import_module(mod)
        except ImportError as exc:
            # claw.data imports psycopg2 — may be missing in super-lean envs.
            log.warning({"event": "warmup_skip", "module": mod, "reason": str(exc)})
