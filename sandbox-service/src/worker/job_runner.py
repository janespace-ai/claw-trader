"""Single-job runner.

This is the direct descendant of ``backtest-engine/sandbox/framework/runner.py``
but reshaped for the long-lived prefork model:

- No ``CLAW_JOB_JSON`` env read — the worker loop passes a ``Job`` in-process.
- No ``sys.exit`` — exceptions propagate so the worker can decide whether to
  log-and-continue or exit for replacement.
- Callback URL is taken from the job, not from env.

The actual *execution semantics* (user code loading, Strategy/Screener
dispatch, DBReader wiring, progress shape) are preserved byte-for-byte so
user code ported from the old runner keeps working unchanged.
"""
from __future__ import annotations

import os
import traceback
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from claw.data import DBReader
from claw.engine import BacktestEngine, run_optimization
from claw.screener import Screener
from claw.strategy import Strategy


# ---- Job envelope ------------------------------------------------------------


@dataclass(slots=True)
class DBCreds:
    host: str
    port: int
    user: str
    password: str
    name: str


@dataclass(slots=True)
class Job:
    """One unit of work pulled off the master's queue."""
    job_id: str
    task_id: str
    mode: str                      # 'backtest' | 'screener' | 'optimization'
    code: str                      # user Python source (already AST+AI approved)
    config: dict[str, Any]
    callback_base_url: str         # e.g. "http://backtest-engine:8081"
    db: DBCreds


# ---- Callback signature (worker injects the concrete poster) -----------------

# Workers hand the runner a callable that knows how to POST to
# ``{callback_base_url}/internal/cb/{channel}/{job_id}`` with retries, disk
# queue, etc.  The runner stays agnostic so it can be unit-tested without
# network.
CallbackPoster = Callable[[str, dict[str, Any]], None]
#                         ^channel  ^payload
# channel in {"progress", "complete", "error"}


# ---- Internal helpers --------------------------------------------------------


def _load_user_module(code: str, name: str = "user_module") -> dict[str, Any]:
    """Compile + exec user code in a fresh namespace.  Returns the module globals.

    Both Gate 1 (AST whitelist) and Gate 2 (AI review) have already approved
    this code by the time it reaches the worker; this exec is the terminal
    execution step inside the rlimit'd worker process.
    """
    mod_globals: dict[str, Any] = {"__name__": name, "__builtins__": __builtins__}
    compiled = compile(code, "<user>", "exec")
    exec(compiled, mod_globals)  # noqa: S102 — see docstring
    return mod_globals


def _find_subclass(ns: dict[str, Any], base_cls: type) -> type | None:
    for obj in ns.values():
        if isinstance(obj, type) and issubclass(obj, base_cls) and obj is not base_cls:
            return obj
    return None


def _parse_time(s: str | int | None, default: datetime) -> datetime:
    """Backend sends strings (unix seconds / RFC3339 / YYYY-MM-DD) interchangeably."""
    if s is None or s == "":
        return default
    if isinstance(s, int) or (isinstance(s, str) and s.isdigit()):
        return datetime.fromtimestamp(int(s), tz=timezone.utc)
    # string formats
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return default


def _export_db_env(db: DBCreds) -> None:
    """Some user code calls ``claw.data.reader_from_env()``.  Populate env so
    that shortcut keeps working.  It's per-process, and since workers run jobs
    serially, no cross-job leakage is possible *between different DB configs*
    (all jobs share the same readonly DSN anyway)."""
    os.environ["CLAW_DB_HOST"] = db.host
    os.environ["CLAW_DB_PORT"] = str(db.port)
    os.environ["CLAW_DB_USER"] = db.user
    os.environ["CLAW_DB_PASSWORD"] = db.password
    os.environ["CLAW_DB_NAME"] = db.name


# ---- Main entrypoint ---------------------------------------------------------


def run_job(job: Job, post: CallbackPoster) -> None:
    """Execute one job.  Never raises — all failures become ``error`` callbacks.

    The caller (worker loop) is expected to treat a return as "job accepted
    and routed to callback"; it does NOT need to inspect a return value.
    """
    try:
        _run_job_inner(job, post)
    except Exception as exc:  # noqa: BLE001 — terminal catch, go to error callback
        tb = traceback.format_exc()
        try:
            post("error", {
                "task_id": job.task_id,
                "job_id": job.job_id,
                "error": f"{type(exc).__name__}: {exc}",
                "traceback": tb,
            })
        except Exception:  # noqa: BLE001
            # Callback itself failed — surface via stderr; the worker's
            # parent process captures logs via docker.
            print(tb)


def _run_job_inner(job: Job, post: CallbackPoster) -> None:
    _export_db_env(job.db)

    def progress(current: int, total: int, phase: str | None = None) -> None:
        post("progress", {
            "task_id": job.task_id,
            "job_id": job.job_id,
            "phase": phase or job.mode,
            "current_bar": current if job.mode != "optimization" else 0,
            "total_bars": total if job.mode != "optimization" else 0,
            "current_run": current if job.mode == "optimization" else 0,
            "total_runs": total if job.mode == "optimization" else 0,
        })

    ns = _load_user_module(job.code)
    db = DBReader(
        host=job.db.host, port=job.db.port,
        user=job.db.user, password=job.db.password, dbname=job.db.name,
    )

    try:
        if job.mode in ("backtest", "optimization"):
            _run_strategy(job, ns, db, progress, post)
        elif job.mode == "screener":
            _run_screener(job, ns, db, progress, post)
        else:
            raise RuntimeError(f"unknown mode {job.mode!r}")
    finally:
        db.close()


def _run_strategy(
    job: Job, ns: dict[str, Any], db: DBReader,
    progress: Callable[..., None], post: CallbackPoster,
) -> None:
    strat_cls = _find_subclass(ns, Strategy)
    if strat_cls is None:
        raise RuntimeError("no class inheriting from Strategy was found in submitted code")

    now = datetime.now(tz=timezone.utc)
    from_ts = _parse_time(job.config.get("from"), now)
    to_ts = _parse_time(job.config.get("to"), now)
    max_runs = int(job.config.get("max_optimization_runs", 100))

    if job.mode == "optimization" and getattr(strat_cls, "params", {}):
        result = run_optimization(
            strat_cls, job.config, db, max_runs, from_ts, to_ts, progress_cb=progress,
        )
    else:
        engine = BacktestEngine(strat_cls(), job.config, db, progress_cb=progress)
        result = engine.run(from_ts, to_ts)

    post("complete", {
        "task_id": job.task_id, "job_id": job.job_id, "mode": job.mode, "result": result,
    })


def _run_screener(
    job: Job, ns: dict[str, Any], db: DBReader,
    progress: Callable[..., None], post: CallbackPoster,
) -> None:
    scr_cls = _find_subclass(ns, Screener)
    if scr_cls is None:
        raise RuntimeError("no class inheriting from Screener was found in submitted code")

    scr = scr_cls()
    lookback_days = int(job.config.get("lookback_days", 365))
    market = job.config.get("market", "futures")
    to_ts = datetime.now(tz=timezone.utc)
    from_ts = to_ts - timedelta(days=lookback_days)

    symbols = db.list_active_symbols(market=market, limit=300)
    results: list[dict[str, Any]] = []
    allowed = {"1h", "4h", "1d"}

    for idx, symbol in enumerate(symbols):
        try:
            klines = {
                "1h": db.load_candles(symbol, "1h", from_ts, to_ts, allowed=allowed),
                "4h": db.load_candles(symbol, "4h", from_ts, to_ts, allowed=allowed),
                "1d": db.load_candles(symbol, "1d", from_ts, to_ts, allowed=allowed),
            }
            metadata = db.load_symbol_metadata(symbol, market=market)
            verdict = scr.filter(symbol, klines, metadata)
            if isinstance(verdict, bool):
                results.append({
                    "symbol": symbol, "passed": verdict,
                    "score": 1.0 if verdict else 0.0,
                    "rank": metadata.get("rank"),
                })
            else:
                passed = float(verdict) > 0
                results.append({
                    "symbol": symbol, "passed": passed,
                    "score": float(verdict),
                    "rank": metadata.get("rank"),
                })
        except Exception as exc:  # noqa: BLE001 — per-symbol isolation
            results.append({
                "symbol": symbol, "passed": False, "score": 0.0,
                "error": f"{type(exc).__name__}: {exc}",
            })
        if idx % 10 == 0:
            progress(idx + 1, len(symbols), phase="screener")

    results.sort(key=lambda r: r["score"], reverse=True)
    payload = {
        "total_symbols": len(symbols),
        "passed": sum(1 for r in results if r["passed"]),
        "results": results,
    }
    post("complete", {
        "task_id": job.task_id, "job_id": job.job_id, "mode": job.mode, "result": payload,
    })
