"""Config loader — reads config.yaml and applies env-var overrides.

Env-var convention: ``SANDBOX_<SECTION>__<KEY>``.  Double underscore separates
section from key so keys with single underscores (``recycle_after_jobs``) aren't
ambiguous.  Examples::

    SANDBOX_POOL__POOL_SIZE=8
    SANDBOX_JOB_LIMITS__MEMORY_MB=4096
    SANDBOX_DB__URL=postgresql://...
    SANDBOX_HTTP__PORT=8091

Values from env win over values from the YAML file (standard 12-factor layering).

``${VAR}`` placeholders in YAML string values are substituted from the process
environment at load time so we can keep secrets out of the committed file
(``db.url: "${CLAW_READONLY_DB_URL}"``).
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import fields, is_dataclass, replace
from pathlib import Path
from typing import Any, TypeVar

_T = TypeVar("_T")

import yaml

from pool.config import (
    CallbackConfig,
    DBConfig,
    HttpConfig,
    JobLimits,
    LoggingConfig,
    PoolConfig,
    Settings,
)


log = logging.getLogger("sandbox.config")


_ENV_PREFIX = "SANDBOX_"
_PLACEHOLDER_RE = re.compile(r"\$\{([A-Z_][A-Z0-9_]*)\}")


def load(path: str | Path | None = None) -> Settings:
    """Load settings from YAML + env overrides.  Missing file → defaults only."""
    raw: dict[str, Any] = {}
    if path is not None:
        p = Path(path)
        if p.is_file():
            with p.open("r", encoding="utf-8") as fh:
                raw = yaml.safe_load(fh) or {}
        else:
            log.warning({"event": "config_file_missing", "path": str(p)})

    # Substitute ${VAR} placeholders (strings only).
    raw = _expand_env_placeholders(raw)

    settings = Settings(
        pool=_merge(PoolConfig(), raw.get("pool")),
        job_limits=_merge(JobLimits(), raw.get("job_limits")),
        db=_merge(DBConfig(url=""), raw.get("db")),
        callback=_merge(CallbackConfig(), raw.get("callback")),
        http=_merge(HttpConfig(), raw.get("http")),
        logging=_merge(LoggingConfig(), raw.get("logging")),
    )

    # Env-var overrides last so they always win.
    settings = _apply_env_overrides(settings, os.environ)

    return settings


# ---- Helpers ----------------------------------------------------------------


def _expand_env_placeholders(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _expand_env_placeholders(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_expand_env_placeholders(v) for v in obj]
    if isinstance(obj, str):
        def sub(m: re.Match[str]) -> str:
            return os.environ.get(m.group(1), m.group(0))
        return _PLACEHOLDER_RE.sub(sub, obj)
    return obj


def _merge(default: _T, overrides: dict[str, Any] | None) -> _T:
    """Return a frozen dataclass with fields overridden from ``overrides``."""
    if overrides is None:
        return default
    if not is_dataclass(default):
        raise TypeError(f"_merge needs a dataclass, got {type(default)!r}")

    allowed = {f.name: f.type for f in fields(default)}
    patch: dict[str, Any] = {}
    for k, v in overrides.items():
        if k not in allowed:
            log.warning({"event": "config_unknown_key", "key": k, "section": type(default).__name__})
            continue
        patch[k] = _coerce(v, allowed[k])
    return replace(default, **patch)  # type: ignore[arg-type]


def _coerce(value: Any, target_type: Any) -> Any:
    """Best-effort coerce scalars — YAML gives us most types for free, but env-var
    overrides come through as strings and ``callback.allowlist_hosts`` needs to
    end up as a tuple."""
    # Handle ``tuple[...]`` annotations (both typing.Tuple and PEP 585 form).
    tt = str(target_type)
    if "tuple" in tt.lower() and isinstance(value, list):
        return tuple(value)
    return value


def _apply_env_overrides(settings: Settings, env: dict[str, str]) -> Settings:
    """Scan env for ``SANDBOX_<SECTION>__<KEY>`` and patch the matching field."""
    section_map: dict[str, str] = {f.name.upper(): f.name for f in fields(settings)}
    patches: dict[str, dict[str, Any]] = {}

    for key, raw_val in env.items():
        if not key.startswith(_ENV_PREFIX):
            continue
        rest = key[len(_ENV_PREFIX):]
        if "__" not in rest:
            continue
        section_u, field_u = rest.split("__", 1)
        section = section_map.get(section_u)
        if section is None:
            continue
        current = getattr(settings, section)
        field_name = field_u.lower()
        allowed = {f.name: f.type for f in fields(current)}
        if field_name not in allowed:
            log.warning({"event": "config_unknown_env_override", "var": key})
            continue
        typed = _coerce_env_str(raw_val, allowed[field_name])
        patches.setdefault(section, {})[field_name] = typed

    for section, patch in patches.items():
        current = getattr(settings, section)
        settings = replace(settings, **{section: replace(current, **patch)})
    return settings


def _coerce_env_str(raw: str, target_type: Any) -> Any:
    tt = str(target_type)
    if "int" in tt and "str" not in tt:
        return int(raw)
    if "float" in tt and "str" not in tt:
        return float(raw)
    if "bool" in tt and "str" not in tt:
        return raw.lower() in ("1", "true", "yes", "on")
    if "tuple" in tt.lower():
        return tuple(s.strip() for s in raw.split(",") if s.strip())
    return raw


__all__ = ["load"]
