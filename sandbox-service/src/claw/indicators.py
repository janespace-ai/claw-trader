"""Indicator helpers built on numpy/pandas. ta-lib is also available in the sandbox."""

from __future__ import annotations

from typing import Sequence

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period, min_periods=1).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low).abs(),
         (high - prev_close).abs(),
         (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.rolling(window=period, min_periods=1).mean()


def bollinger_bands(series: pd.Series, period: int = 20, stddev: float = 2.0):
    mid = series.rolling(window=period, min_periods=period).mean()
    std = series.rolling(window=period, min_periods=period).std()
    upper = mid + stddev * std
    lower = mid - stddev * std
    return upper, mid, lower


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = ema(series, fast)
    ema_slow = ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


INDICATORS = {
    "SMA": lambda df, period=20: sma(df["close"], period),
    "EMA": lambda df, period=20: ema(df["close"], period),
    "RSI": lambda df, period=14: rsi(df["close"], period),
    "ATR": lambda df, period=14: atr(df["high"], df["low"], df["close"], period),
    "BB":  lambda df, period=20, stddev=2.0: bollinger_bands(df["close"], period, stddev),
    "MACD": lambda df, fast=12, slow=26, signal=9: macd(df["close"], fast, slow, signal),
}
