"""Apply per-job Linux rlimits inside a worker process.

Called by the worker before it exec's user code.  On non-Linux dev machines
(macOS, Windows) we soft-apply what's supported and skip what isn't — the
production deployment target is Linux, and tests only assert the Linux path.
"""
from __future__ import annotations

import os
import resource
import sys
from typing import Final

from pool.config import JobLimits

# macOS's resource module is missing RLIMIT_AS; fall back to RLIMIT_DATA.
_IS_LINUX: Final[bool] = sys.platform.startswith("linux")


def apply(limits: JobLimits) -> None:
    """Install rlimits.  Safe to call multiple times — each call overrides."""
    # Virtual memory (RLIMIT_AS on Linux, RLIMIT_DATA on macOS).
    mem_bytes = limits.memory_mb * 1024 * 1024
    _set(_pick_as(), mem_bytes, mem_bytes)

    # CPU seconds — hard kill after this.
    _set(resource.RLIMIT_CPU, limits.cpu_seconds, limits.cpu_seconds)

    # Max processes/threads.
    if hasattr(resource, "RLIMIT_NPROC"):
        _set(resource.RLIMIT_NPROC, limits.max_processes, limits.max_processes)

    # File size written — 0 effectively disables all writes.
    _set(resource.RLIMIT_FSIZE, limits.max_file_size_bytes, limits.max_file_size_bytes)


def _set(rtype: int, soft: int, hard: int) -> None:
    try:
        current_soft, current_hard = resource.getrlimit(rtype)
        # Never raise above the inherited hard ceiling (containers may have
        # their own); take the min.
        hard = min(hard, current_hard) if current_hard != resource.RLIM_INFINITY else hard
        soft = min(soft, hard)
        resource.setrlimit(rtype, (soft, hard))
    except (ValueError, OSError) as exc:
        # setrlimit can refuse if already lowered below target; log but continue.
        print(f"[rlimits] skipped {rtype}: {exc}", flush=True)


def _pick_as() -> int:
    """Prefer ``RLIMIT_AS`` where available (Linux), else ``RLIMIT_DATA``."""
    if hasattr(resource, "RLIMIT_AS"):
        return resource.RLIMIT_AS
    return resource.RLIMIT_DATA


def is_linux() -> bool:
    """Exposed for tests that skip linux-specific behaviour on macOS/Windows."""
    return _IS_LINUX or os.environ.get("CLAW_PRETEND_LINUX") == "1"
