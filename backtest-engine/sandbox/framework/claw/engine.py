"""Backtest engine — drives the Strategy, simulates order fills, tracks P&L.

Only bar-level (close-based) backtests. No tick replay. No funding fees.
"""

from __future__ import annotations

import itertools
import math
from datetime import datetime, timezone
from typing import Any, Callable, Optional

import pandas as pd

from .data import DBReader
from .indicators import INDICATORS
from .strategy import Bar, Position, Strategy
from . import metrics as metrics_mod


class BacktestEngine:
    """Single-run engine. One instance = one set of params.

    Caller feeds the engine a primary-symbol DataFrame (already loaded from DB)
    and optional auxiliary data; engine walks bars chronologically and invokes
    strategy.on_bar().
    """

    def __init__(self, strategy: Strategy, config: dict, db: DBReader,
                 progress_cb: Optional[Callable[[int, int], None]] = None):
        self.strategy = strategy
        self.config = config
        self.db = db
        self.progress_cb = progress_cb

        self.initial_capital: float = float(config.get("initial_capital", 10_000))
        self.commission: float = float(config.get("commission", 0.0006))
        self.slippage: float = float(config.get("slippage", 0.0001))
        self.fill_mode: str = config.get("fill_mode", "close")
        self.interval: str = config["interval"]
        self.symbols: list[str] = list(config["symbols"])

        self._primary_data: dict[str, pd.DataFrame] = {}
        self._aux_requests: set[tuple[str, str]] = set()
        self._aux_data: dict[tuple[str, str], pd.DataFrame] = {}
        self._indicator_requests: list[tuple[str, dict]] = []
        self._indicator_values: dict[tuple[str, tuple], pd.Series] = {}

        self.equity: float = self.initial_capital
        self.equity_curve: list[tuple[pd.Timestamp, float]] = []
        self.positions: dict[str, Position] = {}
        self.trades: list[dict] = []

    # -------- API consumed by Strategy -----------------------------

    def indicator(self, name: str, **kwargs) -> pd.Series:
        key = (name, tuple(sorted(kwargs.items())))
        if key not in self._indicator_requests:
            self._indicator_requests.append((name, kwargs))
        return self._indicator_placeholder(name, kwargs)

    def _indicator_placeholder(self, name: str, kwargs: dict) -> pd.Series:
        # Return an empty series initially; engine fills in after loading data.
        key = (name, tuple(sorted(kwargs.items())))
        return self._indicator_values.setdefault(key, pd.Series(dtype=float))

    def add_data(self, symbol: str, interval: str) -> None:
        self._aux_requests.add((symbol, interval))

    def auxiliary_data(self, symbol: str, interval: str, current_ts: pd.Timestamp) -> pd.DataFrame:
        key = (symbol, interval)
        full = self._aux_data.get(key)
        if full is None or full.empty:
            return pd.DataFrame()
        # Slice to bars whose ts <= current_ts (aligned, most-recent-closed bar).
        return full[full["ts"] <= current_ts]

    def open_position(self, symbol: str, side: str, size: float, leverage: float, bar: Bar) -> None:
        # Close opposite side first.
        existing = self.positions.get(symbol)
        if existing and existing.side != side:
            self.close_position(symbol, bar)
        if symbol in self.positions:
            return  # already on same side; no pyramiding
        fill_price = self._compute_fill_price(bar, side)
        commission = fill_price * size * leverage * self.commission
        self.equity -= commission
        self.positions[symbol] = Position(symbol, side, size, leverage, fill_price, bar.ts)

    def close_position(self, symbol: str, bar: Bar) -> None:
        pos = self.positions.pop(symbol, None)
        if pos is None:
            return
        fill_price = self._compute_fill_price(bar, "short" if pos.side == "long" else "long")
        diff = fill_price - pos.entry_price
        if pos.side == "short":
            diff = -diff
        gross_pnl = diff * pos.size * pos.leverage
        exit_commission = fill_price * pos.size * pos.leverage * self.commission
        net_pnl = gross_pnl - exit_commission

        self.equity += net_pnl

        entry_value = pos.entry_price * pos.size * pos.leverage
        return_pct = (gross_pnl / entry_value * 100) if entry_value > 0 else 0.0
        duration_h = (bar.ts - pos.entry_ts).total_seconds() / 3600 if pos.entry_ts else 0.0

        self.trades.append({
            "symbol": symbol,
            "side": pos.side,
            "entry_time": pos.entry_ts.isoformat(),
            "exit_time": bar.ts.isoformat(),
            "entry_price": pos.entry_price,
            "exit_price": fill_price,
            "size": pos.size,
            "leverage": pos.leverage,
            "pnl": net_pnl,
            "return_pct": return_pct,
            "commission": exit_commission,
            "duration_hours": duration_h,
        })

    def get_position(self, symbol: str) -> Optional[Position]:
        return self.positions.get(symbol)

    # -------- Data loading + run loop ------------------------------

    def _compute_fill_price(self, bar: Bar, side: str) -> float:
        if self.fill_mode == "next_open":
            # For simplicity we still use close + slippage; a true next_open
            # implementation requires peeking forward by one bar.
            base = bar.close
        else:
            base = bar.close
        sign = 1 if side == "long" else -1
        return base * (1 + sign * self.slippage)

    def run(self, from_ts: datetime, to_ts: datetime) -> dict:
        """Load data, run on_bar across primary symbol(s), return result dict."""
        allowed = None  # strategy can access any interval
        for sym in self.symbols:
            df = self.db.load_candles(sym, self.interval, from_ts, to_ts, allowed=allowed)
            self._primary_data[sym] = df

        self.strategy._engine = self
        self.strategy.setup()

        # Load aux data after setup() so add_data() has been called.
        for sym, iv in self._aux_requests:
            self._aux_data[(sym, iv)] = self.db.load_candles(sym, iv, from_ts, to_ts, allowed=allowed)

        # Pre-compute indicators against the first primary symbol's dataframe.
        primary_df = next((df for df in self._primary_data.values() if not df.empty), None)
        if primary_df is not None:
            for name, kwargs in self._indicator_requests:
                fn = INDICATORS.get(name)
                if fn is None:
                    continue
                series = fn(primary_df, **kwargs)
                if isinstance(series, tuple):
                    series = series[0]  # first output of multi-output indicators like BB
                key = (name, tuple(sorted(kwargs.items())))
                self._indicator_values[key] = series.reset_index(drop=True)

        # Main loop: walk each symbol's bars. For MVP, iterate symbol-by-symbol.
        total_bars = sum(len(df) for df in self._primary_data.values())
        processed = 0
        for sym, df in self._primary_data.items():
            for row in df.itertuples(index=False):
                bar = Bar(
                    ts=row.ts, symbol=sym,
                    open=float(row.open), high=float(row.high),
                    low=float(row.low), close=float(row.close),
                    volume=float(row.volume),
                )
                self.strategy._current_bar = bar
                try:
                    self.strategy.on_bar(bar)
                except Exception as exc:  # noqa: BLE001
                    # A strategy error aborts the run with a helpful trace upstream.
                    raise
                # Mark-to-market equity snapshot using current close.
                mtm = self.equity
                for p in self.positions.values():
                    mtm += p.unrealized_pnl(bar.close)
                self.equity_curve.append((bar.ts, mtm))
                processed += 1
                if self.progress_cb and processed % max(100, total_bars // 50) == 0:
                    self.progress_cb(processed, total_bars)

            # Flatten leftover positions at the end of the run.
            if sym in self.positions:
                last_bar_row = df.iloc[-1]
                last_bar = Bar(
                    ts=last_bar_row.ts, symbol=sym,
                    open=last_bar_row.open, high=last_bar_row.high,
                    low=last_bar_row.low, close=last_bar_row.close,
                    volume=last_bar_row.volume,
                )
                self.close_position(sym, last_bar)

        # Build result
        interval_seconds = _interval_seconds(self.interval)
        metrics_result = metrics_mod.compute(
            self.equity_curve, self.trades, self.initial_capital, interval_seconds,
        )
        equity_out = [{"ts": ts.isoformat(), "equity": float(eq)} for ts, eq in self.equity_curve]
        dd_out = metrics_mod.drawdown_curve(self.equity_curve)
        monthly_out = metrics_mod.monthly_returns(self.equity_curve)

        # Per-symbol metrics summary (subset: only symbols that had trades)
        per_symbol: dict[str, Any] = {}
        for sym in self.symbols:
            sym_trades = [t for t in self.trades if t["symbol"] == sym]
            if not sym_trades:
                continue
            per_symbol[sym] = metrics_mod.compute(
                self.equity_curve, sym_trades, self.initial_capital, interval_seconds,
            )

        return {
            "metrics": metrics_result,
            "equity_curve": equity_out,
            "drawdown_curve": dd_out,
            "monthly_returns": monthly_out,
            "trades": self.trades,
            "config": self.config,
            "per_symbol": per_symbol,
        }


def run_optimization(strategy_cls: type[Strategy], config: dict, db: DBReader,
                     max_runs: int, from_ts: datetime, to_ts: datetime,
                     progress_cb: Optional[Callable[[int, int], None]] = None) -> dict:
    """Grid-search over strategy.params; run each combination serially.

    Returns a combined result with:
        - 'optimization_results': [{params, sharpe_ratio, total_return, max_drawdown, total_trades}]
        - 'best': full result dict from the best run (by sharpe).
    """
    params = getattr(strategy_cls, "params", {}) or {}
    if not params:
        # No optimization — single run.
        strat = strategy_cls()
        engine = BacktestEngine(strat, config, db, progress_cb)
        return engine.run(from_ts, to_ts)

    keys = list(params.keys())
    grid = list(itertools.product(*[params[k] for k in keys]))
    sampled = grid
    if len(grid) > max_runs:
        stride = math.ceil(len(grid) / max_runs)
        sampled = grid[::stride][:max_runs]

    points: list[dict] = []
    best_result: Optional[dict] = None
    best_sharpe = -float("inf")

    total = len(sampled)
    for idx, combo in enumerate(sampled):
        params_map = dict(zip(keys, combo))
        strat = strategy_cls()
        strat._current_params = params_map
        engine = BacktestEngine(strat, config, db)
        result = engine.run(from_ts, to_ts)
        metrics_all = result["metrics"]["all"]
        point = {
            "params": params_map,
            "sharpe_ratio": metrics_all.get("sharpe_ratio", 0.0),
            "total_return": metrics_all.get("total_return", 0.0),
            "max_drawdown": metrics_all.get("max_drawdown", 0.0),
            "total_trades": metrics_all.get("total_trades", 0),
        }
        points.append(point)
        if point["sharpe_ratio"] > best_sharpe:
            best_sharpe = point["sharpe_ratio"]
            best_result = result
        if progress_cb:
            progress_cb(idx + 1, total)

    points.sort(key=lambda p: p["sharpe_ratio"], reverse=True)

    final = best_result or {}
    final["optimization_results"] = points
    return final


def _interval_seconds(interval: str) -> int:
    return {
        "5m": 300, "15m": 900, "30m": 1800,
        "1h": 3600, "4h": 14400, "1d": 86400,
    }.get(interval, 3600)
