"""Shared pytest fixtures and path setup.

Adds ``src/`` to ``sys.path`` so tests can ``import pool``, ``import claw``, etc.
without a `src/` prefix.  Matches the ``PYTHONPATH=/app/src`` wiring used in
the Docker image.
"""
from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
