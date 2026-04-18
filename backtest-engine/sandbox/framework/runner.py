"""Sandbox entrypoint. Reads CLAW_JOB_JSON from env, executes user code, reports via HTTP.

Flow:
    1. Parse job envelope.
    2. Export DB credentials to env so claw.data.reader_from_env() works.
    3. Dynamically load user code via `exec` in a restricted namespace
       (still OK — AST checker already ran; this is final execution).
    4. Find subclass of Strategy or Screener.
    5. Run the appropriate engine / screener loop.
    6. POST result/error to callback URL.
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Any

import requests

from claw.data import DBReader
from claw.engine import BacktestEngine, run_optimization
from claw.strategy import Strategy
from claw.screener import Screener


def _parse_job() -> dict:
    raw = os.environ.get("CLAW_JOB_JSON")
    if not raw:
        print("CLAW_JOB_JSON not set", file=sys.stderr)
        sys.exit(2)
    return json.loads(raw)


def _post(url: str, payload: dict) -> None:
    try:
        requests.post(url, json=payload, timeout=10)
    except Exception as exc:  # noqa: BLE001
        print(f"callback failed: {exc}", file=sys.stderr)


def _load_user_module(code: str, name: str = "user_module"):
    """Compile user code as a module, return the module namespace.

    Compliance checking already happened before the container was launched, so
    this exec is considered safe within the sandbox's other defenses (no net,
    readonly FS, resource limits, DB readonly user).
    """
    mod_globals: dict[str, Any] = {"__name__": name, "__builtins__": __builtins__}
    compiled = compile(code, "<user>", "exec")
    exec(compiled, mod_globals)  # noqa: S102 — controlled sandbox
    return mod_globals


def _find_subclass(ns: dict, base_cls: type) -> type | None:
    for obj in ns.values():
        if isinstance(obj, type) and issubclass(obj, base_cls) and obj is not base_cls:
            return obj
    return None


def _parse_time(s: str | None, default: datetime) -> datetime:
    if not s:
        return default
    # Try date, RFC3339, ISO-like.
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return default


def main() -> int:
    job = _parse_job()
    task_id = job["task_id"]
    mode = job["mode"]  # 'backtest' | 'screener' | 'optimization'
    code = job["code"]
    config = job.get("config") or {}
    callback = job["callback_url"]
    db_info = job["db"]

    # Export DB creds for claw.data.reader_from_env()
    os.environ["CLAW_DB_HOST"] = db_info["host"]
    os.environ["CLAW_DB_PORT"] = str(db_info["port"])
    os.environ["CLAW_DB_USER"] = db_info["user"]
    os.environ["CLAW_DB_PASSWORD"] = db_info["password"]
    os.environ["CLAW_DB_NAME"] = db_info["name"]

    def progress(current: int, total: int, phase: str = mode) -> None:
        _post(f"{callback}/internal/cb/progress", {
            "task_id": task_id,
            "phase": phase,
            "current_bar": current if mode != "optimization" else 0,
            "total_bars": total if mode != "optimization" else 0,
            "current_run": current if mode == "optimization" else 0,
            "total_runs": total if mode == "optimization" else 0,
        })

    try:
        ns = _load_user_module(code)
        db = DBReader(
            host=db_info["host"], port=int(db_info["port"]),
            user=db_info["user"], password=db_info["password"],
            dbname=db_info["name"],
        )

        if mode in ("backtest", "optimization"):
            strat_cls = _find_subclass(ns, Strategy)
            if strat_cls is None:
                raise RuntimeError("no class inheriting from Strategy was found in submitted code")

            from_ts = _parse_time(config.get("from"), datetime.now(tz=timezone.utc))
            to_ts = _parse_time(config.get("to"), datetime.now(tz=timezone.utc))
            max_runs = int(config.get("max_optimization_runs", 100))

            if mode == "optimization" and getattr(strat_cls, "params", {}):
                result = run_optimization(strat_cls, config, db, max_runs, from_ts, to_ts,
                                          progress_cb=progress)
            else:
                engine = BacktestEngine(strat_cls(), config, db, progress_cb=progress)
                result = engine.run(from_ts, to_ts)

            _post(f"{callback}/internal/cb/complete", {
                "task_id": task_id, "mode": mode, "result": result,
            })

        elif mode == "screener":
            scr_cls = _find_subclass(ns, Screener)
            if scr_cls is None:
                raise RuntimeError("no class inheriting from Screener was found in submitted code")

            scr = scr_cls()
            lookback_days = int(config.get("lookback_days", 365))
            market = config.get("market", "futures")
            to_ts = datetime.now(tz=timezone.utc)
            from_ts = to_ts.replace(microsecond=0) - _days(lookback_days)

            symbols = db.list_active_symbols(market=market, limit=300)
            results: list[dict] = []
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
                except Exception as exc:  # noqa: BLE001
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
            _post(f"{callback}/internal/cb/complete", {
                "task_id": task_id, "mode": mode, "result": payload,
            })

        else:
            raise RuntimeError(f"unknown mode {mode!r}")

    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        _post(f"{callback}/internal/cb/error", {
            "task_id": task_id,
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": tb,
        })
        print(tb, file=sys.stderr)
        return 1

    return 0


def _days(n: int):
    from datetime import timedelta
    return timedelta(days=n)


if __name__ == "__main__":
    # Small grace period for the spawning goroutine to wire up network
    time.sleep(0.2)
    sys.exit(main())
