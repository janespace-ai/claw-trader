"""Pool internals tests.

Strategy:

- Exercise rlimit logic in-process where possible (Linux only; skip on macOS).
- Drive Master's control-plane state machine by injecting Worker→Master
  messages directly into the ctl queue, without actually forking.
- Full process-forking end-to-end is exercised in ``test_pool_e2e.py``
  (marked slow, kept minimal).
"""
from __future__ import annotations

import sys
import time

import pytest

from pool.config import CallbackConfig, JobLimits, PoolConfig
from pool.master import Master
from pool.messages import (
    JobFinishedMsg,
    JobMsg,
    JobStartedMsg,
    WorkerRetiringMsg,
)


# ---- Messages ----------------------------------------------------------------


def test_jobmsg_defaults_are_safe() -> None:
    m = JobMsg(job_id="j1", task_id="t1", mode="backtest", code="x=1", config={},
               callback_base_url="http://engine", db_host="db", db_port=5432,
               db_user="ro", db_password="", db_name="claw")
    assert m.kind == "job"
    assert m.job_id == "j1"


# ---- rlimits ----------------------------------------------------------------


def test_rlimits_no_op_on_non_linux_is_safe() -> None:
    # Don't actually lower limits on dev machines — just make sure the call
    # doesn't blow up regardless of platform.
    from pool.rlimits import apply  # noqa: PLC0415
    apply(JobLimits(memory_mb=8192, cpu_seconds=60, max_processes=256,
                    max_file_size_bytes=0))


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="rlimit semantics vary off-Linux")
def test_rlimits_apply_cpu_on_linux() -> None:
    import resource  # noqa: PLC0415

    from pool.rlimits import apply  # noqa: PLC0415
    apply(JobLimits(memory_mb=2048, cpu_seconds=1800, max_processes=32,
                    max_file_size_bytes=0))
    soft, _ = resource.getrlimit(resource.RLIMIT_CPU)
    assert soft <= 1800


# ---- Master control-plane message handling ---------------------------------


def _make_master(**overrides: object) -> Master:
    cfg = PoolConfig(
        pool_size=overrides.get("pool_size", 2),  # type: ignore[arg-type]
        recycle_after_jobs=50,
        shutdown_grace_seconds=5,
        status_retention_seconds=overrides.get("status_retention_seconds", 3600),  # type: ignore[arg-type]
    )
    return Master(
        pool_cfg=cfg,
        job_limits=JobLimits(),
        callback_cfg=CallbackConfig(),
    )


def test_status_unknown_job_returns_none() -> None:
    m = _make_master()
    assert m.status("does-not-exist") is None


def test_submit_records_job_as_queued() -> None:
    m = _make_master()
    # No start() — we just want to hit the bookkeeping path without workers.
    m._running = True  # noqa: SLF001 — tested internals
    try:
        m.submit(JobMsg(job_id="j42", task_id="t", mode="backtest", code="",
                        callback_base_url="http://x"))
        st = m.status("j42")
        assert st is not None and st.status == "queued"
    finally:
        m._running = False  # noqa: SLF001


def test_ctl_job_started_flips_to_running() -> None:
    m = _make_master()
    m._running = True  # noqa: SLF001
    m.submit(JobMsg(job_id="jA", task_id="t", mode="backtest", code="",
                    callback_base_url="http://x"))

    # Directly invoke the handler to bypass the thread loop.
    m._handle_ctl_msg(JobStartedMsg(job_id="jA", worker_id=0))  # noqa: SLF001

    st = m.status("jA")
    assert st is not None
    assert st.status == "running"
    assert st.worker_id == 0
    assert st.started_at is not None


def test_ctl_job_finished_flips_to_done() -> None:
    m = _make_master()
    m._running = True  # noqa: SLF001
    m.submit(JobMsg(job_id="jB", task_id="t", mode="backtest", code="",
                    callback_base_url="http://x"))
    m._handle_ctl_msg(JobStartedMsg(job_id="jB", worker_id=1))  # noqa: SLF001
    m._handle_ctl_msg(JobFinishedMsg(job_id="jB", worker_id=1, ok=True))  # noqa: SLF001

    st = m.status("jB")
    assert st is not None
    assert st.status == "done"
    assert st.finished_at is not None


def test_ctl_job_finished_failure_path() -> None:
    m = _make_master()
    m._running = True  # noqa: SLF001
    m.submit(JobMsg(job_id="jC", task_id="t", mode="backtest", code="",
                    callback_base_url="http://x"))
    m._handle_ctl_msg(JobFinishedMsg(  # noqa: SLF001
        job_id="jC", worker_id=0, ok=False, error="boom",
    ))
    st = m.status("jC")
    assert st is not None
    assert st.status == "failed"
    assert st.error == "boom"


def test_worker_retiring_triggers_replacement_when_running() -> None:
    """When a worker retires and master is running, the pool should restock.

    We don't actually fork here — just verify the spawn path is taken.
    """
    m = _make_master()
    spawned: list[int] = []
    original = m._spawn_worker_locked  # noqa: SLF001

    def _fake_spawn() -> object:
        wid = m._next_worker_id  # noqa: SLF001
        m._next_worker_id += 1  # noqa: SLF001
        spawned.append(wid)

        class Fake:
            process = type("P", (), {"is_alive": lambda self: True, "pid": 0,
                                      "join": lambda self, timeout=None: None})()
            worker_id = wid
            started_at = time.time()
            current_job_id = None
        f = Fake()
        m._workers[wid] = f  # type: ignore[assignment]  # noqa: SLF001
        return f

    m._spawn_worker_locked = _fake_spawn  # type: ignore[assignment]  # noqa: SLF001
    try:
        # Simulate pool at full strength already.
        _fake_spawn()
        _fake_spawn()
        initial_count = len(spawned)

        # Retire worker 0.
        m._handle_ctl_msg(WorkerRetiringMsg(worker_id=0, jobs_completed=50))  # noqa: SLF001

        # Master should have spawned a replacement (identity independent of name).
        assert len(spawned) == initial_count + 1
    finally:
        m._spawn_worker_locked = original  # type: ignore[assignment]  # noqa: SLF001


def test_gc_ages_out_finished_jobs() -> None:
    m = _make_master(status_retention_seconds=0)  # drop immediately
    m._running = True  # noqa: SLF001
    m.submit(JobMsg(job_id="jGC", task_id="t", mode="backtest", code="",
                    callback_base_url="http://x"))
    m._handle_ctl_msg(JobFinishedMsg(job_id="jGC", worker_id=0, ok=True))  # noqa: SLF001

    # Force finished_at into the past.
    st = m.status("jGC")
    assert st is not None
    st.finished_at = time.time() - 10

    m._gc_once()  # noqa: SLF001
    assert m.status("jGC") is None


def test_cannot_submit_after_shutdown_starts() -> None:
    m = _make_master()
    m._running = True  # noqa: SLF001
    m._shutting_down.set()  # noqa: SLF001

    with pytest.raises(RuntimeError, match="shutting down"):
        m.submit(JobMsg(job_id="late", task_id="t", mode="backtest", code="",
                        callback_base_url="http://x"))
