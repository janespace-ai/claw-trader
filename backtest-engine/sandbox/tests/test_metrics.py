"""Tests for claw.metrics.compute.

Uses the deterministic `sample_equity_curve` + `sample_trades` fixtures
from conftest.py. Exact expected values are pinned in testdata/golden_metrics.json;
if the computation changes, update that file (and review why).
"""
from __future__ import annotations

import json
import os
from typing import Any

import pytest

from claw.metrics import compute  # type: ignore

GOLDEN_PATH = os.path.join(os.path.dirname(__file__), "testdata", "golden_metrics.json")
INITIAL_CAPITAL = 100.0
BAR_INTERVAL_SECONDS = 3600  # hourly


def _load_golden() -> dict[str, Any]:
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_metrics_keys_present(sample_equity_curve, sample_trades):
    result = compute(sample_equity_curve, sample_trades, INITIAL_CAPITAL, BAR_INTERVAL_SECONDS)
    assert set(result.keys()) == {"all", "long", "short"}
    for key in ("total_return", "max_drawdown", "sharpe_ratio", "win_rate"):
        assert key in result["all"]


def test_all_dimension_matches_golden(sample_equity_curve, sample_trades):
    result = compute(sample_equity_curve, sample_trades, INITIAL_CAPITAL, BAR_INTERVAL_SECONDS)
    golden = _load_golden()
    # Tolerances:
    #   - exact for counts (total_trades, long_trades, short_trades)
    #   - tight float compare for the headline ratios we care about
    all_m = result["all"]
    g = golden["all"]
    assert all_m["total_trades"] == g["total_trades"]
    assert all_m["long_trades"] == g["long_trades"]
    assert all_m["short_trades"] == g["short_trades"]
    for k in ("total_return", "max_drawdown", "sharpe_ratio", "win_rate",
             "avg_win", "avg_loss", "profit_factor", "annualized_return"):
        assert all_m[k] == pytest.approx(g[k], rel=1e-6, abs=1e-9), \
            f"{k} drift: got {all_m[k]}, golden {g[k]}"


def test_long_short_split(sample_equity_curve, sample_trades):
    result = compute(sample_equity_curve, sample_trades, INITIAL_CAPITAL, BAR_INTERVAL_SECONDS)
    # All sample trades are long → long.total_trades == 3, short.total_trades == 0.
    assert result["long"]["total_trades"] == 3
    assert result["short"]["total_trades"] == 0
