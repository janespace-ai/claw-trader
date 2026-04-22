"""DB data loading helpers — sandbox uses the readonly user."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Iterable

import pandas as pd
import psycopg2
import psycopg2.extras


_SUPPORTED_INTERVALS_STRATEGY = {"5m", "15m", "30m", "1h", "4h", "1d"}
_SUPPORTED_INTERVALS_SCREENER = {"1h", "4h", "1d"}


class DBReader:
    """Thin DB reader built around a pool-per-process psycopg2 connection.

    Never holds transactions; every query autocommits. Reconnects on failure.
    """

    def __init__(self, host: str, port: int, user: str, password: str, dbname: str):
        self._dsn = dict(host=host, port=port, user=user, password=password, dbname=dbname)
        self._conn = None

    def _get_conn(self):
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(**self._dsn)
            self._conn.autocommit = True
        return self._conn

    def close(self):
        if self._conn and not self._conn.closed:
            self._conn.close()

    def load_candles(self, symbol: str, interval: str, from_ts: datetime, to_ts: datetime,
                     allowed: Iterable[str] | None = None) -> pd.DataFrame:
        """Load OHLCV candles for (symbol, interval) in [from_ts, to_ts]."""
        if allowed is not None and interval not in set(allowed):
            raise PermissionError(
                f"interval {interval!r} not available for this code type; "
                f"allowed = {sorted(allowed)}"
            )
        if interval not in _SUPPORTED_INTERVALS_STRATEGY:
            raise ValueError(f"unsupported interval: {interval!r}")

        table = f"claw.futures_{interval}"
        conn = self._get_conn()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(
                f"""
                SELECT ts, open, high, low, close, volume, quote_volume
                FROM {table}
                WHERE symbol = %s AND ts >= %s AND ts <= %s
                ORDER BY ts ASC
                """,
                (symbol, from_ts, to_ts),
            )
            rows = cur.fetchall()
        if not rows:
            return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume", "quote_volume"])
        df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume", "quote_volume"])
        df["ts"] = pd.to_datetime(df["ts"], utc=True)
        return df

    def load_symbol_metadata(self, symbol: str, market: str = "futures") -> dict:
        conn = self._get_conn()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(
                """
                SELECT symbol, market, rank, COALESCE(volume_24h_quote, 0) AS volume_24h_quote,
                       status, updated_at
                FROM claw.symbols
                WHERE market = %s AND symbol = %s
                """,
                (market, symbol),
            )
            row = cur.fetchone()
        if row is None:
            return {
                "symbol": symbol, "market": market, "rank": None,
                "volume_24h_quote": 0.0, "leverage_max": 0, "status": "unknown",
            }
        return {
            "symbol": row["symbol"],
            "market": row["market"],
            "rank": row["rank"],
            "volume_24h_quote": float(row["volume_24h_quote"]),
            "leverage_max": 0,  # upstream table does not yet carry this; left as placeholder
            "status": row["status"],
        }

    def list_active_symbols(self, market: str = "futures", limit: int = 300) -> list[str]:
        conn = self._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT symbol FROM claw.symbols
                WHERE market = %s AND rank IS NOT NULL AND status = 'active'
                ORDER BY rank ASC
                LIMIT %s
                """,
                (market, limit),
            )
            return [r[0] for r in cur.fetchall()]


def reader_from_env() -> DBReader:
    """Build a DBReader from env vars injected by the sandbox launcher."""
    # Job JSON is parsed by runner.py and placed in env; fall back to individual vars.
    return DBReader(
        host=os.environ["CLAW_DB_HOST"],
        port=int(os.environ["CLAW_DB_PORT"]),
        user=os.environ["CLAW_DB_USER"],
        password=os.environ["CLAW_DB_PASSWORD"],
        dbname=os.environ["CLAW_DB_NAME"],
    )
