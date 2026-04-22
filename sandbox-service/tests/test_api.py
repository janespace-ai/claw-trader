"""HTTP layer tests.

We test the FastAPI app against a Master whose spawn function is monkey-patched
so no actual workers are forked.  End-to-end tests that really fork live in
``test_pool_e2e.py`` (slow).

Note on lifespan: FastAPI's TestClient runs the app in a thread, so
``signal.signal()`` inside the lifespan handler raises ValueError — the app
is written to swallow that.
"""
from __future__ import annotations

import time
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from api.main import build_app
from pool.config import (
    CallbackConfig,
    DBConfig,
    HttpConfig,
    JobLimits,
    LoggingConfig,
    PoolConfig,
    Settings,
)


# ---- Fixtures --------------------------------------------------------------


@pytest.fixture
def settings() -> Settings:
    return Settings(
        pool=PoolConfig(pool_size=2, recycle_after_jobs=50,
                        shutdown_grace_seconds=0, status_retention_seconds=3600),
        job_limits=JobLimits(),
        db=DBConfig(url="postgresql://claw_readonly:x@localhost/claw"),
        callback=CallbackConfig(allowlist_hosts=("service-api", "localhost")),
        http=HttpConfig(),
        logging=LoggingConfig(),
    )


@pytest.fixture
def client(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    app = build_app(settings)

    # Patch the Master so startup doesn't actually fork workers.
    master = app.state.master
    spawned: list[int] = []

    def _fake_spawn() -> object:
        wid = master._next_worker_id  # noqa: SLF001
        master._next_worker_id += 1   # noqa: SLF001
        spawned.append(wid)

        class FakeProc:
            def is_alive(self) -> bool: return True
            def join(self, timeout: float | None = None) -> None: return None
            def terminate(self) -> None: return None
            def kill(self) -> None: return None
            pid = 0
            exitcode: int | None = None

        class FakeWH:
            worker_id = wid
            process = FakeProc()
            started_at = time.time()
            current_job_id: str | None = None

        wh = FakeWH()
        master._workers[wid] = wh  # type: ignore[assignment]  # noqa: SLF001
        return wh

    monkeypatch.setattr(master, "_spawn_worker_locked", _fake_spawn)

    with TestClient(app) as c:
        yield c


# ---- POST /run -------------------------------------------------------------


def _valid_body(**overrides: object) -> dict:
    body = {
        "job_id": "j1",
        "task_id": "t1",
        "mode": "backtest",
        "code": "x = 1",
        "config": {},
        "callback_base_url": "http://service-api:8081",
        "db": {"host": "ts", "port": 5432, "user": "ro", "password": "x", "name": "claw"},
    }
    body.update(overrides)  # type: ignore[arg-type]
    return body


def test_run_accepts_valid_job(client: TestClient) -> None:
    r = client.post("/run", json=_valid_body())
    assert r.status_code == 202, r.text
    assert r.json() == {"job_id": "j1", "status": "queued"}


def test_run_rejects_callback_host_not_in_allowlist(client: TestClient) -> None:
    r = client.post("/run", json=_valid_body(
        job_id="j2", callback_base_url="http://evil.example.com",
    ))
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "CALLBACK_HOST_NOT_ALLOWED"


def test_run_rejects_bad_mode(client: TestClient) -> None:
    r = client.post("/run", json=_valid_body(job_id="j3", mode="nonsense"))
    assert r.status_code == 422  # pydantic validation


def test_run_requires_job_id(client: TestClient) -> None:
    r = client.post("/run", json=_valid_body(job_id=""))
    assert r.status_code == 422


# ---- GET /status/{job_id} --------------------------------------------------


def test_status_unknown_is_404(client: TestClient) -> None:
    r = client.get("/status/does-not-exist")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "NOT_FOUND"


def test_status_after_submit_is_queued(client: TestClient) -> None:
    client.post("/run", json=_valid_body(job_id="jq"))
    r = client.get("/status/jq")
    assert r.status_code == 200
    body = r.json()
    assert body["job_id"] == "jq"
    assert body["status"] == "queued"
    assert body["worker_id"] is None


# ---- GET /healthz ----------------------------------------------------------


def test_healthz_ready_when_pool_full(client: TestClient, settings: Settings) -> None:
    # Fixture spawned pool_size=2 fake workers → ready.
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True
    assert body["workers_ready"] == settings.pool.pool_size
    assert body["shutting_down"] is False


def test_healthz_503_when_pool_under_target(client: TestClient) -> None:
    # Kill one of the fake workers to drop below target.
    master = client.app.state.master  # type: ignore[attr-defined]
    first = next(iter(master._workers))  # noqa: SLF001
    del master._workers[first]  # noqa: SLF001

    r = client.get("/healthz")
    assert r.status_code == 503
    assert r.json()["ready"] is False
