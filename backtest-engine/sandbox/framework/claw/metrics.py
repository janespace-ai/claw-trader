"""Backtest metrics — 30+ metrics across 4 categories, ALL/LONG/SHORT dimensions."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Iterable

import numpy as np
import pandas as pd

# Risk-free rate assumed zero for simplicity (common in crypto backtests).
RISK_FREE = 0.0


@dataclass
class Metrics:
    # Returns
    total_return: float = 0.0
    annualized_return: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_duration: float = 0.0
    profit_factor: float = 0.0
    expectancy: float = 0.0
    equity_final: float = 0.0
    equity_peak: float = 0.0
    # Risk
    volatility_ann: float = 0.0
    downside_deviation: float = 0.0
    var_95: float = 0.0
    cvar_95: float = 0.0
    max_consecutive_wins: int = 0
    max_consecutive_losses: int = 0
    # Risk-adjusted
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    calmar_ratio: float = 0.0
    omega_ratio: float = 0.0
    win_rate: float = 0.0
    risk_reward_ratio: float = 0.0
    recovery_factor: float = 0.0
    # Trade analysis
    total_trades: int = 0
    avg_trade_return: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    avg_trade_duration: float = 0.0
    max_trade_duration: float = 0.0
    long_trades: int = 0
    short_trades: int = 0
    best_trade: float = 0.0
    worst_trade: float = 0.0


def compute(equity_curve: list[tuple[datetime, float]],
            trades: list[dict],
            initial_capital: float,
            bar_interval_seconds: int) -> dict:
    """Compute Metrics for ALL, LONG and SHORT dimensions.

    Returns dict with keys 'all', 'long', 'short' — each a metrics dict.
    """
    if not equity_curve:
        equity_curve = [(datetime.utcnow(), initial_capital)]

    df_equity = pd.DataFrame(equity_curve, columns=["ts", "equity"]).set_index("ts")
    returns = df_equity["equity"].pct_change().dropna()

    bars_per_year = 0
    if bar_interval_seconds > 0:
        bars_per_year = int(round(365 * 24 * 3600 / bar_interval_seconds))

    def build(trades_subset: list[dict]) -> Metrics:
        m = Metrics()
        m.equity_final = float(df_equity["equity"].iloc[-1])
        m.equity_peak = float(df_equity["equity"].cummax().iloc[-1])
        m.total_return = (m.equity_final / initial_capital - 1) * 100

        # Annualized metrics
        if len(df_equity) > 1 and bars_per_year > 0:
            total_bars = len(df_equity)
            years = total_bars / bars_per_year
            if years > 0:
                m.annualized_return = ((m.equity_final / initial_capital) ** (1 / years) - 1) * 100

        if len(returns) > 0:
            m.volatility_ann = float(returns.std() * np.sqrt(max(bars_per_year, 1)) * 100)
            downside = returns[returns < 0]
            m.downside_deviation = float(downside.std() * np.sqrt(max(bars_per_year, 1)) * 100) \
                if len(downside) > 0 else 0.0
            m.var_95 = float(np.percentile(returns, 5) * 100)
            m.cvar_95 = float(returns[returns <= np.percentile(returns, 5)].mean() * 100) \
                if len(returns) > 0 else 0.0

            # Sharpe / Sortino / Omega
            mean_ret = returns.mean()
            if returns.std() > 0:
                m.sharpe_ratio = float((mean_ret - RISK_FREE) / returns.std() * np.sqrt(max(bars_per_year, 1)))
            if len(downside) > 0 and downside.std() > 0:
                m.sortino_ratio = float((mean_ret - RISK_FREE) / downside.std() * np.sqrt(max(bars_per_year, 1)))
            pos = returns[returns > 0].sum()
            neg = -returns[returns < 0].sum()
            m.omega_ratio = float(pos / neg) if neg > 0 else 0.0

        # Drawdown
        peak = df_equity["equity"].cummax()
        dd = (df_equity["equity"] - peak) / peak * 100
        m.max_drawdown = float(dd.min())
        # Drawdown duration in days (using equity index)
        below_peak = (df_equity["equity"] < peak).astype(int)
        if below_peak.any():
            runs = below_peak.groupby((below_peak == 0).cumsum()).cumsum()
            max_run_bars = int(runs.max())
            m.max_drawdown_duration = round(max_run_bars * bar_interval_seconds / 86400, 2)
        if m.max_drawdown != 0:
            m.calmar_ratio = float(m.annualized_return / abs(m.max_drawdown)) if m.max_drawdown < 0 else 0.0
            m.recovery_factor = float(m.total_return / abs(m.max_drawdown))

        # Trade-level stats
        if trades_subset:
            pnls = [t["pnl"] for t in trades_subset]
            wins = [p for p in pnls if p > 0]
            losses = [p for p in pnls if p < 0]
            m.total_trades = len(trades_subset)
            m.long_trades = sum(1 for t in trades_subset if t.get("side") == "long")
            m.short_trades = sum(1 for t in trades_subset if t.get("side") == "short")
            m.avg_trade_return = float(np.mean([t["return_pct"] for t in trades_subset]))
            m.best_trade = float(max(t["return_pct"] for t in trades_subset))
            m.worst_trade = float(min(t["return_pct"] for t in trades_subset))
            m.win_rate = (len(wins) / m.total_trades) * 100
            m.avg_win = float(np.mean(wins)) if wins else 0.0
            m.avg_loss = float(np.mean(losses)) if losses else 0.0
            m.profit_factor = float(sum(wins) / -sum(losses)) if losses and sum(losses) < 0 else 0.0
            m.expectancy = (m.win_rate / 100 * m.avg_win) + ((1 - m.win_rate / 100) * m.avg_loss)
            if m.avg_loss != 0:
                m.risk_reward_ratio = float(m.avg_win / abs(m.avg_loss))

            durations_h = [t["duration_hours"] for t in trades_subset if "duration_hours" in t]
            if durations_h:
                m.avg_trade_duration = float(np.mean(durations_h))
                m.max_trade_duration = float(np.max(durations_h))

            # Max consecutive wins/losses
            cur_win = cur_loss = max_win = max_loss = 0
            for p in pnls:
                if p > 0:
                    cur_win += 1
                    cur_loss = 0
                    max_win = max(max_win, cur_win)
                elif p < 0:
                    cur_loss += 1
                    cur_win = 0
                    max_loss = max(max_loss, cur_loss)
            m.max_consecutive_wins = max_win
            m.max_consecutive_losses = max_loss

        return m

    all_m = build(trades)
    longs = [t for t in trades if t.get("side") == "long"]
    shorts = [t for t in trades if t.get("side") == "short"]
    return {
        "all": asdict(all_m),
        "long": asdict(build(longs)),
        "short": asdict(build(shorts)),
    }


def monthly_returns(equity_curve: list[tuple[datetime, float]]) -> list[dict]:
    if not equity_curve:
        return []
    df = pd.DataFrame(equity_curve, columns=["ts", "equity"]).set_index("ts")
    monthly = df["equity"].resample("M").last().pct_change().dropna() * 100
    out = []
    for ts, ret in monthly.items():
        out.append({"year": ts.year, "month": ts.month, "return": float(ret)})
    return out


def drawdown_curve(equity_curve: list[tuple[datetime, float]]) -> list[dict]:
    if not equity_curve:
        return []
    df = pd.DataFrame(equity_curve, columns=["ts", "equity"]).set_index("ts")
    peak = df["equity"].cummax()
    dd = (df["equity"] - peak) / peak * 100
    return [{"ts": ts.isoformat(), "drawdown": float(val)} for ts, val in dd.items()]
