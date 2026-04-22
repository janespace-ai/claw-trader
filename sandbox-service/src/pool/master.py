"""Master process — owns the worker pool lifecycle.

Responsibilities:

- Fork ``pool_size`` worker children at boot.
- Dispatch jobs: ``POST /run`` on the HTTP side enqueues into ``job_queue``;
  any idle worker picks it up.
- Track status: maintain an in-memory job-status table keyed by ``job_id``.
- Recycle: when a worker emits ``WorkerRetiringMsg``, fork a replacement so
  the pool stays at ``pool_size``.
- Replace on crash: if a worker exits unexpectedly (``SIGCHLD`` without a
  ``WorkerRetiringMsg``), mark its in-flight job failed and fork a replacement.
- Drain on shutdown: enqueue ``ShutdownMsg`` × pool_size, wait up to
  ``shutdown_grace_seconds``, then SIGTERM / SIGKILL.

The Master runs in the main process — it does *not* accept HTTP directly.
The FastAPI app (``api.main``) talks to the Master via :meth:`submit` and
:meth:`status`.
"""
from __future__ import annotations

import logging
import multiprocessing as mp
import os
import signal
import threading
import time
from dataclasses import dataclass, field
from multiprocessing.context import SpawnProcess
from queue import Empty, Queue as SyncQueue
from typing import Any

from pool.config import CallbackConfig, JobLimits, PoolConfig
from pool.messages import (
    JobFinishedMsg,
    JobMsg,
    JobStartedMsg,
    ShutdownMsg,
    WorkerRetiringMsg,
)
from pool.worker import worker_main


log = logging.getLogger("sandbox.master")


# ---- Status bookkeeping ------------------------------------------------------


@dataclass(slots=True)
class JobStatus:
    job_id: str
    status: str = "queued"            # queued | running | done | failed
    worker_id: int | None = None
    queued_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    error: str = ""


@dataclass(slots=True)
class WorkerHandle:
    worker_id: int
    process: SpawnProcess
    started_at: float
    # Job the worker most recently reported ``job_started`` on — used when
    # the worker crashes so we know which job to fail.
    current_job_id: str | None = None


# ---- Master ------------------------------------------------------------------


class Master:
    """Thread-safe facade used by the HTTP layer."""

    def __init__(
        self,
        pool_cfg: PoolConfig,
        job_limits: JobLimits,
        callback_cfg: CallbackConfig,
    ) -> None:
        self._pool_cfg = pool_cfg
        self._job_limits = job_limits
        self._callback_cfg = callback_cfg

        # Spawn context on Linux avoids inheriting any async file descriptors
        # from the parent uvicorn process (forking would copy them and cause
        # file-descriptor stealing on shutdown).
        self._ctx = mp.get_context("spawn")
        self._job_queue: "mp.Queue[Any]" = self._ctx.Queue()
        self._ctl_queue: "mp.Queue[Any]" = self._ctx.Queue()

        self._lock = threading.RLock()
        self._workers: dict[int, WorkerHandle] = {}
        self._next_worker_id = 0
        self._jobs: dict[str, JobStatus] = {}

        self._running = False
        self._ctl_thread: threading.Thread | None = None
        self._gc_thread: threading.Thread | None = None

        self._shutting_down = threading.Event()

    # ---- Lifecycle ----------------------------------------------------------

    def start(self) -> None:
        """Fork initial pool and start the control-plane thread.  Idempotent."""
        with self._lock:
            if self._running:
                return
            self._running = True
            for _ in range(self._pool_cfg.pool_size):
                self._spawn_worker_locked()

        self._ctl_thread = threading.Thread(
            target=self._ctl_loop, name="master-ctl", daemon=True,
        )
        self._ctl_thread.start()

        self._gc_thread = threading.Thread(
            target=self._gc_loop, name="master-gc", daemon=True,
        )
        self._gc_thread.start()

        log.info({
            "event": "master_started",
            "pool_size": self._pool_cfg.pool_size,
            "recycle_after": self._pool_cfg.recycle_after_jobs,
        })

    def shutdown(self) -> None:
        """Graceful drain: stop new jobs, tell workers to finish and exit."""
        if self._shutting_down.is_set():
            return
        self._shutting_down.set()
        log.info({"event": "master_shutdown_begin"})

        with self._lock:
            for _ in self._workers:
                self._job_queue.put(ShutdownMsg())

        deadline = time.monotonic() + self._pool_cfg.shutdown_grace_seconds
        while time.monotonic() < deadline:
            with self._lock:
                alive = [w for w in self._workers.values() if w.process.is_alive()]
            if not alive:
                break
            time.sleep(0.2)

        # Kill stragglers.
        with self._lock:
            for wh in list(self._workers.values()):
                if wh.process.is_alive():
                    log.warning({"event": "master_force_terminate", "worker_id": wh.worker_id})
                    wh.process.terminate()
            for wh in list(self._workers.values()):
                wh.process.join(timeout=5.0)
                if wh.process.is_alive():
                    wh.process.kill()

        self._running = False
        log.info({"event": "master_shutdown_done"})

    # ---- Public API (called by HTTP layer) -----------------------------------

    def submit(self, msg: JobMsg) -> str:
        """Enqueue a job and return its job_id.  Blocking on queue is bounded
        (Queue is unbounded in practice; overflow protection TBD if needed)."""
        if self._shutting_down.is_set():
            raise RuntimeError("service is shutting down; not accepting new jobs")
        with self._lock:
            self._jobs[msg.job_id] = JobStatus(job_id=msg.job_id)
        self._job_queue.put(msg)
        return msg.job_id

    def status(self, job_id: str) -> JobStatus | None:
        """Return current job status, or ``None`` if unknown / GC'd."""
        with self._lock:
            return self._jobs.get(job_id)

    def workers_ready(self) -> tuple[int, int]:
        """Returns (ready, total) — 'ready' means process is_alive."""
        with self._lock:
            total = len(self._workers)
            ready = sum(1 for w in self._workers.values() if w.process.is_alive())
        return ready, total

    def is_running(self) -> bool:
        return self._running and not self._shutting_down.is_set()

    # ---- Internals -----------------------------------------------------------

    def _spawn_worker_locked(self) -> WorkerHandle:
        """Fork a new worker.  Caller must hold ``self._lock``."""
        wid = self._next_worker_id
        self._next_worker_id += 1
        proc = self._ctx.Process(
            target=worker_main,
            args=(
                wid,
                self._job_queue,
                self._ctl_queue,
                self._job_limits,
                self._callback_cfg,
                self._pool_cfg.recycle_after_jobs,
            ),
            name=f"sandbox-worker-{wid}",
            daemon=False,
        )
        proc.start()
        wh = WorkerHandle(worker_id=wid, process=proc, started_at=time.time())
        self._workers[wid] = wh
        log.info({"event": "worker_spawn", "worker_id": wid, "pid": proc.pid})
        return wh

    def _ctl_loop(self) -> None:
        """Consume Worker→Master messages forever."""
        while self._running:
            try:
                msg = self._ctl_queue.get(timeout=0.5)
            except Empty:
                continue
            try:
                self._handle_ctl_msg(msg)
            except Exception:  # noqa: BLE001
                log.exception({"event": "master_ctl_handler_error"})

    def _handle_ctl_msg(self, msg: Any) -> None:
        if isinstance(msg, JobStartedMsg):
            with self._lock:
                st = self._jobs.get(msg.job_id)
                if st is not None:
                    st.status = "running"
                    st.started_at = time.time()
                    st.worker_id = msg.worker_id
                wh = self._workers.get(msg.worker_id)
                if wh is not None:
                    wh.current_job_id = msg.job_id
            return

        if isinstance(msg, JobFinishedMsg):
            with self._lock:
                st = self._jobs.get(msg.job_id)
                if st is not None:
                    st.status = "done" if msg.ok else "failed"
                    st.finished_at = time.time()
                    st.error = msg.error
                wh = self._workers.get(msg.worker_id)
                if wh is not None:
                    wh.current_job_id = None
            return

        if isinstance(msg, WorkerRetiringMsg):
            with self._lock:
                wh = self._workers.pop(msg.worker_id, None)
                if wh is not None:
                    wh.process.join(timeout=10)
                # Replace unless shutting down.
                if not self._shutting_down.is_set():
                    self._spawn_worker_locked()
            return

        log.warning({"event": "master_unknown_ctl_msg", "type": type(msg).__name__})

    def _gc_loop(self) -> None:
        """Background: detect dead workers (crash without retire), age out jobs.

        - If a worker process is no longer alive but wasn't marked retiring,
          treat it as a crash: fail whatever job it was running, replace.
        - Jobs whose ``finished_at`` is older than ``status_retention_seconds``
          get dropped from the in-memory table.
        """
        while self._running:
            try:
                self._gc_once()
            except Exception:  # noqa: BLE001
                log.exception({"event": "master_gc_error"})
            time.sleep(1.0)

    def _gc_once(self) -> None:
        now = time.time()
        to_replace: list[int] = []

        with self._lock:
            # Detect crashes.
            for wid, wh in list(self._workers.items()):
                if not wh.process.is_alive():
                    # Fail the in-flight job if any.
                    if wh.current_job_id:
                        st = self._jobs.get(wh.current_job_id)
                        if st is not None and st.status == "running":
                            st.status = "failed"
                            st.finished_at = now
                            st.error = (
                                f"worker {wid} exited unexpectedly "
                                f"(exitcode={wh.process.exitcode})"
                            )
                            log.warning({
                                "event": "master_worker_crash",
                                "worker_id": wid,
                                "job_id": wh.current_job_id,
                                "exitcode": wh.process.exitcode,
                            })
                    del self._workers[wid]
                    to_replace.append(wid)

            # Age-out finished jobs.
            cutoff = now - self._pool_cfg.status_retention_seconds
            stale = [
                jid for jid, st in self._jobs.items()
                if st.finished_at is not None and st.finished_at < cutoff
            ]
            for jid in stale:
                del self._jobs[jid]

            # Restock the pool.
            if not self._shutting_down.is_set():
                for _ in to_replace:
                    self._spawn_worker_locked()

    # ---- Signal helpers ------------------------------------------------------

    def install_signal_handlers(self) -> None:
        """Wire SIGTERM / SIGINT to graceful shutdown.  Must be called from
        the main thread of the Master process."""
        def _handle(signum: int, _frame: Any) -> None:
            log.info({"event": "master_signal", "signum": signum})
            self.shutdown()

        signal.signal(signal.SIGTERM, _handle)
        signal.signal(signal.SIGINT, _handle)

    # ---- Introspection for tests --------------------------------------------

    def _inject_control_queue(self) -> "mp.Queue[Any]":
        """For unit tests that want to simulate worker messages."""
        return self._ctl_queue


# ---- Helpers for non-OS-backed tests ---------------------------------------


def make_test_queue() -> SyncQueue[Any]:
    """Tests that don't need true multi-process can use a synchronous Queue
    in place of an ``mp.Queue``.  Exposed here so test code doesn't have to
    reach into the multiprocessing internals."""
    return SyncQueue()


__all__ = [
    "JobStatus",
    "Master",
    "WorkerHandle",
    "make_test_queue",
]


if __name__ == "__main__":  # pragma: no cover — run by python -m for smoke
    logging.basicConfig(level=logging.INFO)
    master = Master(
        pool_cfg=PoolConfig(pool_size=2, recycle_after_jobs=3),
        job_limits=JobLimits(memory_mb=512, cpu_seconds=10, max_processes=16),
        callback_cfg=CallbackConfig(),
    )
    master.install_signal_handlers()
    master.start()
    try:
        while master.is_running():
            time.sleep(1.0)
    finally:
        master.shutdown()
        os._exit(0)
