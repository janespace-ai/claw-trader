"""Strategy base class. User code subclasses and implements setup/on_bar."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import pandas as pd


@dataclass
class Bar:
    ts: pd.Timestamp
    symbol: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class Position:
    """Tracks an open position opened by buy()/sell()."""

    __slots__ = ("symbol", "side", "size", "leverage", "entry_price", "entry_ts")

    def __init__(self, symbol: str, side: str, size: float, leverage: float,
                 entry_price: float, entry_ts: pd.Timestamp):
        self.symbol = symbol
        self.side = side  # 'long' | 'short'
        self.size = size
        self.leverage = leverage
        self.entry_price = entry_price
        self.entry_ts = entry_ts

    def unrealized_pnl(self, price: float) -> float:
        diff = price - self.entry_price
        if self.side == "short":
            diff = -diff
        return diff * self.size * self.leverage


class Strategy:
    """Base class for user strategies.

    Required overrides:
        setup(self): declare indicators + add_data calls.
        on_bar(self, bar): called once per primary bar in chronological order.
    """

    # Optional: declare parameter sweep ranges for optimization.
    # Example: params = {'sma_fast': [5, 10, 20], 'sma_slow': [30, 50]}
    params: dict[str, list[Any]] = {}

    def __init__(self):
        # Runtime state injected by the engine before setup().
        self._engine = None        # BacktestEngine instance
        self._current_bar: Optional[Bar] = None
        self._current_params: dict[str, Any] = {}

    # ---- User-override hooks --------------------------------------

    def setup(self) -> None:
        """Declare indicators, add supplementary data, initialize state."""
        pass

    def on_bar(self, bar: Bar) -> None:
        """Called on every primary bar. Override to implement logic."""
        raise NotImplementedError("Strategy.on_bar must be implemented")

    # ---- User-facing API ------------------------------------------

    def param(self, name: str, default: Any = None) -> Any:
        """Get current parameter value for the active run."""
        return self._current_params.get(name, default)

    def indicator(self, name: str, **kwargs) -> pd.Series:
        """Request an indicator series pre-computed on the primary K-line."""
        return self._engine.indicator(name, **kwargs)

    def add_data(self, symbol: str, interval: str) -> None:
        """Declare that this strategy will access auxiliary data (symbol, interval)."""
        self._engine.add_data(symbol, interval)

    def data(self, symbol: str, interval: str) -> pd.DataFrame:
        """Access auxiliary K-line data aligned to the current bar time."""
        return self._engine.auxiliary_data(symbol, interval, self._current_bar.ts)

    def buy(self, size: float = 1.0, leverage: float = 1.0, symbol: Optional[str] = None) -> None:
        self._engine.open_position(
            symbol=symbol or self._current_bar.symbol,
            side="long", size=size, leverage=leverage, bar=self._current_bar,
        )

    def sell(self, size: float = 1.0, leverage: float = 1.0, symbol: Optional[str] = None) -> None:
        self._engine.open_position(
            symbol=symbol or self._current_bar.symbol,
            side="short", size=size, leverage=leverage, bar=self._current_bar,
        )

    def close(self, symbol: Optional[str] = None) -> None:
        """Close open position on the given (or current) symbol."""
        self._engine.close_position(
            symbol=symbol or self._current_bar.symbol,
            bar=self._current_bar,
        )

    def position(self, symbol: Optional[str] = None) -> Optional[Position]:
        return self._engine.get_position(symbol or self._current_bar.symbol)
