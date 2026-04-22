"""HTTP callback client: sandbox-service → backtest-engine.

One instance per worker.  Design:

- Three channels: ``progress``, ``complete``, ``error`` — all ``POST`` to
  ``{base_url}/internal/cb/{channel}/{job_id}`` with a JSON body.
- Retry: 3 attempts, delays from ``CallbackConfig.retry_delays_seconds``
  (default 1 s / 3 s / 10 s).  Synchronous — the worker is dedicated to one
  job and is happy to block up to ~14 s on a transient engine hiccup.
- Allowlist: ``callback_base_url``'s host must be in
  ``callback.allowlist_hosts``.  Second line of defense; the API layer
  already checks this at submission.
- Disk queue: after all retries fail, the envelope is persisted to a SQLite
  file (WAL mode — multi-process safe).  A background flusher thread retries
  queued rows every ``flusher_interval_seconds`` until success.

Why SQLite and not just JSON-lines: we need "delete-on-success" semantics
plus atomic attempts counter.  ``sqlite3`` is in the stdlib — no new dep.

Shutdown: call ``close()`` to stop the flusher thread and close DB/HTTP
handles.  (The worker process exits on retirement, which implicitly closes
them, but tests should call it explicitly.)
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from pool.config import CallbackConfig


log = logging.getLogger("sandbox.callback")


_SCHEMA = """
CREATE TABLE IF NOT EXISTS pending (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_url TEXT NOT NULL,
    channel TEXT NOT NULL,
    job_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pending_created ON pending(created_at);
"""


class CallbackError(Exception):
    """Raised when the callback fails *and* we couldn't even enqueue it."""


class CallbackClient:
    """Fire-and-forget HTTP poster with retries + disk spillover.

    Thread-safe: ``post()`` and the flusher thread share ``_db_lock``.
    """

    def __init__(
        self,
        cfg: CallbackConfig,
        *,
        http_timeout_seconds: float = 10.0,
    ) -> None:
        self._cfg = cfg
        self._allowlist = set(cfg.allowlist_hosts)
        self._http = httpx.Client(timeout=http_timeout_seconds)

        self._db_path = Path(cfg.on_disk_queue_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(
            self._db_path, check_same_thread=False, isolation_level=None,
        )
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(_SCHEMA)
        self._db_lock = threading.Lock()

        self._stop = threading.Event()
        self._flusher = threading.Thread(
            target=self._flush_loop, name="callback-flusher", daemon=True,
        )
        self._flusher.start()

    # ---- Public API ---------------------------------------------------------

    def post(
        self,
        base_url: str,
        channel: str,
        job_id: str,
        payload: dict[str, Any],
    ) -> bool:
        """Fire a callback.  Returns True on success, False on final failure
        (row enqueued to disk in that case — will be retried by the flusher).

        Never raises for transient failures; only raises ``CallbackError`` if
        both the live attempts AND the disk enqueue fail.
        """
        if not self._host_allowed(base_url):
            log.warning({
                "event": "callback_host_not_allowed",
                "base_url": base_url, "job_id": job_id, "channel": channel,
            })
            return False

        url = self._build_url(base_url, channel, job_id)

        # Live attempts: N tries with configured delays between them.
        last_err = ""
        delays = (0.0, *self._cfg.retry_delays_seconds)
        for attempt, delay in enumerate(delays, start=1):
            if delay > 0:
                time.sleep(delay)
            try:
                r = self._http.post(url, json=payload)
                if 200 <= r.status_code < 300:
                    return True
                last_err = f"HTTP {r.status_code}: {r.text[:200]}"
            except httpx.HTTPError as exc:
                last_err = f"{type(exc).__name__}: {exc}"
            log.info({
                "event": "callback_attempt_failed",
                "attempt": attempt, "job_id": job_id,
                "channel": channel, "error": last_err,
            })

        # All live attempts exhausted — persist.
        try:
            self._enqueue(base_url, channel, job_id, payload, last_err)
        except sqlite3.Error as exc:
            raise CallbackError(
                f"failed to enqueue callback after retries: {exc}",
            ) from exc
        return False

    def close(self) -> None:
        self._stop.set()
        self._flusher.join(timeout=5.0)
        with self._db_lock:
            self._db.close()
        self._http.close()

    # ---- Internals ----------------------------------------------------------

    def _host_allowed(self, base_url: str) -> bool:
        host = urlparse(base_url).hostname or ""
        return host in self._allowlist

    @staticmethod
    def _build_url(base_url: str, channel: str, job_id: str) -> str:
        # Strip trailing slash to avoid double slashes.
        base = base_url.rstrip("/")
        return f"{base}/internal/cb/{channel}/{job_id}"

    def _enqueue(
        self,
        base_url: str,
        channel: str,
        job_id: str,
        payload: dict[str, Any],
        last_error: str,
    ) -> None:
        with self._db_lock:
            self._db.execute(
                "INSERT INTO pending "
                "(base_url, channel, job_id, payload_json, attempts, created_at, last_error) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (base_url, channel, job_id, json.dumps(payload),
                 len(self._cfg.retry_delays_seconds) + 1, time.time(), last_error),
            )
        log.warning({
            "event": "callback_enqueued",
            "job_id": job_id, "channel": channel, "last_error": last_error,
        })

    def _flush_loop(self) -> None:
        """Drain the disk queue periodically.

        The wait uses ``Event.wait`` so ``close()`` can unblock us immediately.
        """
        interval = self._cfg.flusher_interval_seconds
        while not self._stop.wait(interval):
            try:
                self._flush_once()
            except Exception:  # noqa: BLE001
                log.exception({"event": "callback_flush_error"})

    def _flush_once(self) -> None:
        with self._db_lock:
            rows = self._db.execute(
                "SELECT id, base_url, channel, job_id, payload_json, attempts "
                "FROM pending ORDER BY id ASC LIMIT 100",
            ).fetchall()

        for row_id, base_url, channel, job_id, payload_json, attempts in rows:
            url = self._build_url(base_url, channel, job_id)
            try:
                r = self._http.post(url, json=json.loads(payload_json))
                success = 200 <= r.status_code < 300
                err = "" if success else f"HTTP {r.status_code}"
            except httpx.HTTPError as exc:
                success = False
                err = f"{type(exc).__name__}: {exc}"

            with self._db_lock:
                if success:
                    self._db.execute("DELETE FROM pending WHERE id = ?", (row_id,))
                    log.info({
                        "event": "callback_flushed", "job_id": job_id, "channel": channel,
                    })
                else:
                    self._db.execute(
                        "UPDATE pending SET attempts = ?, last_error = ? WHERE id = ?",
                        (attempts + 1, err, row_id),
                    )

    # ---- Test introspection -------------------------------------------------

    def _pending_count(self) -> int:
        with self._db_lock:
            return int(self._db.execute(
                "SELECT COUNT(*) FROM pending",
            ).fetchone()[0])


__all__ = ["CallbackClient", "CallbackError"]
