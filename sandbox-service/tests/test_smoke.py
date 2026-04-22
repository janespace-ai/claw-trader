"""Minimal smoke test — verifies package layout and imports resolve.

Expanded in later task groups to cover pool/HTTP/callback behaviour.
"""
from __future__ import annotations


def test_claw_package_imports() -> None:
    import claw  # noqa: F401
