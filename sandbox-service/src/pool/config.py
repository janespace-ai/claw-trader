"""Typed config objects shared across pool, api, callback.

Loading + env-var overrides live in :mod:`api.config`.  This module only
defines the dataclasses so circular imports don't bite.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True, frozen=True)
class PoolConfig:
    pool_size: int = 4
    recycle_after_jobs: int = 50
    shutdown_grace_seconds: int = 60
    status_retention_seconds: int = 3600


@dataclass(slots=True, frozen=True)
class JobLimits:
    memory_mb: int = 2048
    cpu_seconds: int = 1800
    max_processes: int = 32
    max_file_size_bytes: int = 0


@dataclass(slots=True, frozen=True)
class DBConfig:
    url: str


@dataclass(slots=True, frozen=True)
class CallbackConfig:
    allowlist_hosts: tuple[str, ...] = ("service-api", "localhost")
    retry_delays_seconds: tuple[int, ...] = (1, 3, 10)
    on_disk_queue_path: str = "/var/lib/claw-sandbox/callback_queue.sqlite"
    flusher_interval_seconds: int = 30


@dataclass(slots=True, frozen=True)
class HttpConfig:
    host: str = "0.0.0.0"  # noqa: S104 — internal-only network
    port: int = 8090


@dataclass(slots=True, frozen=True)
class LoggingConfig:
    level: str = "INFO"
    format: str = "json"


@dataclass(slots=True, frozen=True)
class Settings:
    pool: PoolConfig = field(default_factory=PoolConfig)
    job_limits: JobLimits = field(default_factory=JobLimits)
    db: DBConfig = field(default_factory=lambda: DBConfig(url=""))
    callback: CallbackConfig = field(default_factory=CallbackConfig)
    http: HttpConfig = field(default_factory=HttpConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
