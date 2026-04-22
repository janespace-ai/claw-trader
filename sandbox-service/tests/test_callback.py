"""Callback client tests.

We shim out the network layer by monkey-patching ``httpx.Client.post`` on the
instance — so no real sockets are opened and the retry delays can be zeroed
out to keep the test suite fast.

Coverage:
- Success on first try.
- Success on retry 2 after transient error on try 1.
- All retries fail → row lands in SQLite.
- Flusher drains the SQLite queue when network comes back.
- Host not in allowlist → refused (no request issued).
- URL building is stable against trailing slashes in ``base_url``.
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Callable

import httpx
import pytest

from callback.client import CallbackClient
from pool.config import CallbackConfig


class _FakeResponse:
    def __init__(self, status_code: int, body: str = "") -> None:
        self.status_code = status_code
        self.text = body


def _make_client(
    tmp_path: Path,
    *,
    allow: tuple[str, ...] = ("engine",),
    delays: tuple[int, ...] = (0, 0, 0),   # skip real waits in tests
    flusher_interval: int = 60,            # effectively disabled unless we poke it
) -> CallbackClient:
    cfg = CallbackConfig(
        allowlist_hosts=allow,
        retry_delays_seconds=delays,
        on_disk_queue_path=str(tmp_path / "queue.sqlite"),
        flusher_interval_seconds=flusher_interval,
    )
    return CallbackClient(cfg)


def _install_post(client: CallbackClient, fn: Callable[[str, Any], _FakeResponse]) -> list[str]:
    """Replace the httpx.Client.post method; return a list of URLs actually called."""
    calls: list[str] = []

    def _post(url: str, *, json: Any | None = None, **_: Any) -> _FakeResponse:  # noqa: A002
        calls.append(url)
        return fn(url, json)

    client._http.post = _post  # type: ignore[assignment]  # noqa: SLF001
    return calls


# ---- Happy path ------------------------------------------------------------


def test_post_success_single_try(tmp_path: Path) -> None:
    c = _make_client(tmp_path)
    try:
        calls = _install_post(c, lambda _u, _j: _FakeResponse(200))
        ok = c.post("http://engine:8081", "progress", "jX", {"pct": 10})
        assert ok is True
        assert len(calls) == 1
        assert calls[0] == "http://engine:8081/internal/cb/progress/jX"
        assert c._pending_count() == 0   # noqa: SLF001
    finally:
        c.close()


def test_post_success_on_retry(tmp_path: Path) -> None:
    c = _make_client(tmp_path, delays=(0, 0, 0))
    try:
        seen = {"n": 0}

        def _fn(_u: str, _j: Any) -> _FakeResponse:
            seen["n"] += 1
            return _FakeResponse(500) if seen["n"] < 2 else _FakeResponse(200)

        _install_post(c, _fn)
        ok = c.post("http://engine:8081", "complete", "jR", {"ok": True})
        assert ok is True
        assert seen["n"] == 2
        assert c._pending_count() == 0   # noqa: SLF001
    finally:
        c.close()


# ---- Failure path ----------------------------------------------------------


def test_all_retries_fail_persists_to_disk(tmp_path: Path) -> None:
    c = _make_client(tmp_path, delays=(0, 0, 0))
    try:
        _install_post(c, lambda _u, _j: _FakeResponse(502, "gateway down"))
        ok = c.post("http://engine:8081", "error", "jF", {"msg": "boom"})
        assert ok is False
        assert c._pending_count() == 1   # noqa: SLF001

        # Verify the row has the payload we sent.
        with sqlite3.connect(tmp_path / "queue.sqlite") as db:
            row = db.execute(
                "SELECT base_url, channel, job_id, payload_json, last_error FROM pending",
            ).fetchone()
        assert row[1] == "error"
        assert row[2] == "jF"
        assert json.loads(row[3]) == {"msg": "boom"}
        assert "502" in row[4]
    finally:
        c.close()


def test_httpx_exception_counts_as_failure(tmp_path: Path) -> None:
    c = _make_client(tmp_path, delays=(0,))
    try:
        def _fn(_u: str, _j: Any) -> _FakeResponse:
            raise httpx.ConnectError("dns blew up")

        _install_post(c, _fn)
        ok = c.post("http://engine:8081", "progress", "jE", {})
        assert ok is False
        assert c._pending_count() == 1   # noqa: SLF001
    finally:
        c.close()


# ---- Flusher ---------------------------------------------------------------


def test_flusher_drains_disk_queue_when_network_recovers(tmp_path: Path) -> None:
    c = _make_client(tmp_path, delays=(0,))
    try:
        # Arrange a failed enqueue.
        _install_post(c, lambda _u, _j: _FakeResponse(500))
        assert c.post("http://engine:8081", "progress", "jP", {"pct": 50}) is False
        assert c._pending_count() == 1   # noqa: SLF001

        # Now "recover" — flusher should drain.
        _install_post(c, lambda _u, _j: _FakeResponse(200))
        c._flush_once()   # noqa: SLF001 — avoid waiting on the thread interval
        assert c._pending_count() == 0   # noqa: SLF001
    finally:
        c.close()


def test_flusher_keeps_row_if_still_failing(tmp_path: Path) -> None:
    c = _make_client(tmp_path, delays=(0,))
    try:
        _install_post(c, lambda _u, _j: _FakeResponse(500))
        c.post("http://engine:8081", "error", "jK", {"msg": "x"})
        before = c._pending_count()   # noqa: SLF001
        c._flush_once()   # noqa: SLF001
        # Still failing → row sticks around, attempts bumped.
        assert c._pending_count() == before   # noqa: SLF001
        with sqlite3.connect(tmp_path / "queue.sqlite") as db:
            attempts = db.execute("SELECT attempts FROM pending").fetchone()[0]
        assert attempts >= 3
    finally:
        c.close()


# ---- Allowlist -------------------------------------------------------------


def test_host_not_in_allowlist_is_refused(tmp_path: Path) -> None:
    c = _make_client(tmp_path, allow=("engine",))
    try:
        calls = _install_post(c, lambda _u, _j: _FakeResponse(200))
        ok = c.post("http://evil.example.com", "progress", "jA", {})
        assert ok is False
        assert calls == []              # never attempted
        assert c._pending_count() == 0  # never enqueued either  # noqa: SLF001
    finally:
        c.close()


# ---- URL building ----------------------------------------------------------


def test_url_trailing_slash_is_normalized(tmp_path: Path) -> None:
    c = _make_client(tmp_path)
    try:
        calls = _install_post(c, lambda _u, _j: _FakeResponse(200))
        c.post("http://engine:8081/", "progress", "jS", {})
        assert calls == ["http://engine:8081/internal/cb/progress/jS"]
    finally:
        c.close()
