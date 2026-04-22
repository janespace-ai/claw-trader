"""Config loader tests.

Covers:
- YAML parse + merge over dataclass defaults
- ${ENV} placeholder substitution inside string values
- SANDBOX_<SECTION>__<KEY> env overrides (int, tuple, string)
- Unknown keys warned-and-ignored (no exception)
"""
from __future__ import annotations

from pathlib import Path

import pytest

from api.config import load


def _write(tmp_path: Path, content: str) -> Path:
    p = tmp_path / "config.yaml"
    p.write_text(content, encoding="utf-8")
    return p


def test_load_defaults_when_file_missing(tmp_path: Path) -> None:
    s = load(tmp_path / "does-not-exist.yaml")
    assert s.pool.pool_size == 4
    assert s.http.port == 8090


def test_load_merges_yaml_over_defaults(tmp_path: Path) -> None:
    p = _write(tmp_path, """
pool:
  pool_size: 8
http:
  port: 9000
""")
    s = load(p)
    assert s.pool.pool_size == 8
    assert s.pool.recycle_after_jobs == 50   # default preserved
    assert s.http.port == 9000


def test_env_placeholder_substitution(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MY_DB_URL", "postgresql://ro:pw@ts:5432/claw")
    p = _write(tmp_path, """
db:
  url: "${MY_DB_URL}"
""")
    s = load(p)
    assert s.db.url == "postgresql://ro:pw@ts:5432/claw"


def test_env_var_overrides_win(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    p = _write(tmp_path, """
pool:
  pool_size: 2
""")
    monkeypatch.setenv("SANDBOX_POOL__POOL_SIZE", "16")
    s = load(p)
    assert s.pool.pool_size == 16


def test_env_var_coerces_tuple(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    p = _write(tmp_path, "")
    monkeypatch.setenv("SANDBOX_CALLBACK__ALLOWLIST_HOSTS", "host-a, host-b,host-c")
    s = load(p)
    assert s.callback.allowlist_hosts == ("host-a", "host-b", "host-c")


def test_unknown_keys_are_ignored(tmp_path: Path) -> None:
    p = _write(tmp_path, """
pool:
  pool_size: 3
  nonsense_field: 42
""")
    s = load(p)   # must not raise
    assert s.pool.pool_size == 3
