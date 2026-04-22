"""Framework migration smoke tests.

These don't assert behaviour end-to-end (that requires a real TimescaleDB)
but they do catch the most likely regressions:

- imports resolve against the layout under ``src/``
- public API signatures are unchanged
- Strategy/Screener subclassing still works the way user code expects
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from claw.screener import Screener
from claw.strategy import Bar, Position, Strategy


# ---- Strategy base class -----------------------------------------------------


def test_strategy_subclass_requires_on_bar() -> None:
    class BareStrategy(Strategy):
        def setup(self) -> None:
            pass

    s = BareStrategy()
    try:
        s.on_bar(Bar(
            ts=pd.Timestamp("2026-04-22", tz="UTC"), symbol="BTC_USDT",
            open=1, high=2, low=0.5, close=1.5, volume=100,
        ))
    except NotImplementedError:
        return
    raise AssertionError("expected NotImplementedError")


def test_strategy_param_returns_default() -> None:
    class S(Strategy):
        def on_bar(self, bar: Bar) -> None:  # pragma: no cover
            pass

    s = S()
    assert s.param("sma_fast", default=9) == 9


def test_position_unrealized_pnl_long() -> None:
    p = Position(
        symbol="BTC_USDT", side="long", size=2.0, leverage=5.0,
        entry_price=100.0, entry_ts=pd.Timestamp("2026-04-22", tz="UTC"),
    )
    assert p.unrealized_pnl(110.0) == 10 * 2 * 5


def test_position_unrealized_pnl_short() -> None:
    p = Position(
        symbol="BTC_USDT", side="short", size=2.0, leverage=5.0,
        entry_price=100.0, entry_ts=pd.Timestamp("2026-04-22", tz="UTC"),
    )
    assert p.unrealized_pnl(90.0) == 10 * 2 * 5


# ---- Screener base class -----------------------------------------------------


def test_screener_filter_contract() -> None:
    class MyScr(Screener):
        def filter(self, symbol: str, klines: dict[str, pd.DataFrame], metadata: dict[str, Any]):
            return metadata.get("rank", 999) <= 100

    s = MyScr()
    assert s.filter("BTC_USDT", {}, {"rank": 1}) is True
    assert s.filter("DOGE_USDT", {}, {"rank": 200}) is False


def test_screener_filter_raises_when_unimplemented() -> None:
    class Bad(Screener):
        pass

    try:
        Bad().filter("X", {}, {})
    except NotImplementedError:
        return
    raise AssertionError("expected NotImplementedError")


# ---- job_runner helpers ------------------------------------------------------


def test_parse_time_accepts_unix_seconds_int() -> None:
    from worker.job_runner import _parse_time  # noqa: PLC0415
    import datetime as dt

    default = dt.datetime(2099, 1, 1, tzinfo=dt.timezone.utc)
    out = _parse_time(1700000000, default)
    assert out == dt.datetime.fromtimestamp(1700000000, tz=dt.timezone.utc)


def test_parse_time_accepts_unix_seconds_string() -> None:
    from worker.job_runner import _parse_time  # noqa: PLC0415
    import datetime as dt

    default = dt.datetime(2099, 1, 1, tzinfo=dt.timezone.utc)
    out = _parse_time("1700000000", default)
    assert out == dt.datetime.fromtimestamp(1700000000, tz=dt.timezone.utc)


def test_parse_time_accepts_yyyy_mm_dd() -> None:
    from worker.job_runner import _parse_time  # noqa: PLC0415
    import datetime as dt

    default = dt.datetime(2099, 1, 1, tzinfo=dt.timezone.utc)
    out = _parse_time("2026-04-01", default)
    assert out == dt.datetime(2026, 4, 1, tzinfo=dt.timezone.utc)


def test_parse_time_falls_back_to_default_on_garbage() -> None:
    from worker.job_runner import _parse_time  # noqa: PLC0415
    import datetime as dt

    default = dt.datetime(2099, 1, 1, tzinfo=dt.timezone.utc)
    out = _parse_time("not a date", default)
    assert out == default


def test_find_subclass_returns_user_strategy() -> None:
    from worker.job_runner import _find_subclass, _load_user_module  # noqa: PLC0415

    code = """
from claw.strategy import Strategy
class MyStrat(Strategy):
    def on_bar(self, bar):
        pass
"""
    ns = _load_user_module(code)
    cls = _find_subclass(ns, Strategy)
    assert cls is not None and cls.__name__ == "MyStrat"


def test_find_subclass_returns_none_when_missing() -> None:
    from worker.job_runner import _find_subclass, _load_user_module  # noqa: PLC0415

    ns = _load_user_module("x = 1\n")
    assert _find_subclass(ns, Strategy) is None
