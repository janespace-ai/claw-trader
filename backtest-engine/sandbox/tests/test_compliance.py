"""Tests for the AST compliance checker.

The checker is invoked the same way backtest-engine's Go wrapper does:
python3 ast_checker.py '<policy_json>' < source_code
"""
from __future__ import annotations

import json
import subprocess
import sys
from typing import Any

import pytest

# Minimal policy mirroring backtest-engine/config.yaml.
POLICY: dict[str, Any] = {
    "module_whitelist": [
        "numpy",
        "pandas",
        "talib",
        "math",
        "datetime",
        "collections",
        "typing",
        "dataclasses",
        "decimal",
        "json",
        "claw",
        "claw.strategy",
        "claw.screener",
    ],
    "forbidden_builtins": ["exec", "eval", "compile", "__import__", "open", "input"],
    "forbidden_modules": [
        "os", "sys", "subprocess", "socket", "shutil",
        "pathlib", "importlib", "ctypes",
    ],
}


def _run(source: str, script_path: str, policy: dict[str, Any] = None) -> dict[str, Any]:
    policy = policy or POLICY
    result = subprocess.run(
        [sys.executable, script_path, json.dumps(policy)],
        input=source,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, f"checker exited {result.returncode}: {result.stderr}"
    return json.loads(result.stdout)


@pytest.mark.parametrize("builtin", POLICY["forbidden_builtins"])
def test_each_forbidden_builtin_rejected(builtin: str, ast_checker_path: str):
    # Build source that either CALLS the builtin or just REFERENCES it, depending on form.
    source = f"x = {builtin}(1)" if builtin != "__import__" else "x = __import__('os')"
    verdict = _run(source, ast_checker_path)
    assert verdict["ok"] is False, f"{builtin} was NOT rejected"
    kinds = {e["rule"] for e in verdict["errors"]}
    # Checker may tag it as forbidden_call, forbidden_name, or forbidden_attribute.
    assert kinds & {"forbidden_call", "forbidden_name", "forbidden_attribute"}


@pytest.mark.parametrize("mod", POLICY["forbidden_modules"])
def test_each_forbidden_module_rejected(mod: str, ast_checker_path: str):
    source = f"import {mod}"
    verdict = _run(source, ast_checker_path)
    assert verdict["ok"] is False, f"import {mod} was NOT rejected"
    assert any(e["rule"] == "forbidden_module" for e in verdict["errors"])


@pytest.mark.parametrize("mod", ["numpy", "pandas", "math", "datetime"])
def test_whitelisted_module_accepted(mod: str, ast_checker_path: str):
    source = f"import {mod}"
    verdict = _run(source, ast_checker_path)
    assert verdict["ok"] is True, f"import {mod} rejected: {verdict['errors']}"


def test_import_from_whitelisted_submodule(ast_checker_path: str):
    source = "from claw.strategy import Strategy"
    verdict = _run(source, ast_checker_path)
    assert verdict["ok"], verdict


def test_attribute_chain_block(ast_checker_path: str):
    # Even `x.exec(...)` is flagged (via the attribute form).
    source = "import numpy as np\nnp.exec('print(1)')"
    verdict = _run(source, ast_checker_path)
    assert verdict["ok"] is False
    assert any(e["rule"] == "forbidden_call" for e in verdict["errors"])


def test_double_underscore_access_block(ast_checker_path: str):
    source = "import numpy as np\nnp.__class__.__subclasses__()"
    verdict = _run(source, ast_checker_path)
    assert verdict["ok"] is False
    rules = {e["rule"] for e in verdict["errors"]}
    assert "forbidden_attribute" in rules
