"""Pytest setup for the sandbox framework tests.

Adds `backtest-engine/sandbox/framework` to sys.path so tests can
`import claw` the same way user code does inside the sandbox container.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta

import pytest

# Resolve paths
SANDBOX_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMEWORK_DIR = os.path.join(SANDBOX_ROOT, "framework")
COMPLIANCE_DIR = os.path.abspath(
    os.path.join(SANDBOX_ROOT, "..", "internal", "compliance")
)

# Add framework/ so `import claw` resolves.
if FRAMEWORK_DIR not in sys.path:
    sys.path.insert(0, FRAMEWORK_DIR)


@pytest.fixture
def sample_equity_curve() -> list[tuple[datetime, float]]:
    """10-bar deterministic equity curve — 1h interval, monotonic + a drawdown."""
    start = datetime(2025, 6, 1, 0, 0, 0)
    values = [100.0, 101.0, 102.0, 103.0, 102.5, 101.0, 99.0, 100.0, 102.0, 104.0]
    return [(start + timedelta(hours=i), v) for i, v in enumerate(values)]


@pytest.fixture
def sample_trades() -> list[dict]:
    """3 trades: 2 wins, 1 loss. All long-side for simplicity."""
    return [
        {"side": "long", "pnl": 2.0, "return_pct": 2.0, "duration_hours": 2.0},
        {"side": "long", "pnl": -1.5, "return_pct": -1.5, "duration_hours": 1.5},
        {"side": "long", "pnl": 3.0, "return_pct": 3.0, "duration_hours": 4.0},
    ]


@pytest.fixture
def ast_checker_path() -> str:
    """Absolute path to the AST checker script."""
    return os.path.join(COMPLIANCE_DIR, "ast_checker.py")
