"""Screener base class — user filters symbols based on 1h/4h/1d K-lines + metadata.

The screener framework enforces that only 1h, 4h, and 1d data are loaded.
Attempting to access minute-level bars raises PermissionError.
"""

from __future__ import annotations

from typing import Any

import pandas as pd


class Screener:
    """Base class for user screeners.

    Implement filter(self, symbol, klines, metadata) returning bool | float:
        - bool True => passes, bool False => does not pass
        - float > 0 => passes with score; float <= 0 => fails with score
    """

    def filter(self, symbol: str, klines: dict[str, pd.DataFrame], metadata: dict[str, Any]):
        raise NotImplementedError("Screener.filter must be implemented")
