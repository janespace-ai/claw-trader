"""JSON-structured logging for sandbox-service.

All log records are emitted as single-line JSON objects so they can be ingested
by log aggregators (Loki / CloudWatch) without regex gymnastics.  Record bodies
can be a dict (preferred — becomes nested fields) or a plain string (put into
``message``).

Usage::

    log = logging.getLogger("sandbox.api")
    log.info({"event": "run_submitted", "job_id": jid})

The existing library calls using plain strings still work — they end up under
``message``.
"""
from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any


class JsonFormatter(logging.Formatter):
    """Format LogRecord as JSON.  Dict ``msg`` merges into the top-level object.

    We deliberately avoid the ``logging.Formatter`` ``%(…)s`` machinery so a
    dict message with a ``%`` in a value can't blow up with TypeError.
    """

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        payload: dict[str, Any] = {
            "ts": _iso(record.created),
            "level": record.levelname,
            "logger": record.name,
        }

        msg = record.msg
        if isinstance(msg, dict):
            payload.update(msg)
        else:
            try:
                payload["message"] = record.getMessage()
            except TypeError:
                payload["message"] = str(msg)

        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)

        # Extras attached via ``logger.info(..., extra={...})`` ride along.
        for key in ("job_id", "worker_id", "duration_ms"):
            val = getattr(record, key, None)
            if val is not None:
                payload.setdefault(key, val)

        return json.dumps(payload, default=str, separators=(",", ":"))


def _iso(ts: float) -> str:
    # RFC 3339 with milliseconds in UTC.
    gmt = time.gmtime(ts)
    ms = int((ts - int(ts)) * 1000)
    return f"{time.strftime('%Y-%m-%dT%H:%M:%S', gmt)}.{ms:03d}Z"


def setup(level: str = "INFO", fmt: str = "json") -> None:
    """Install a root handler.  Idempotent — replaces existing handlers."""
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    if fmt == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root.addHandler(handler)
    root.setLevel(level.upper())


__all__ = ["JsonFormatter", "setup"]
