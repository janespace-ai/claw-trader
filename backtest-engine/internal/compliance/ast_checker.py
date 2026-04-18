#!/usr/bin/env python3
"""AST-based static analyzer for user-submitted strategy/screener code.

Read Python source from stdin, read policy JSON from argv[1],
emit a JSON verdict to stdout.

Verdict schema (stdout):
    {"ok": bool, "errors": [{"rule": str, "line": int, "message": str}, ...]}

Exit 0 regardless of verdict — callers inspect the JSON.
"""

from __future__ import annotations

import ast
import json
import sys
from typing import Any


def check(source: str, policy: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []

    # Parse phase. Syntax errors are hard fails.
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:  # pragma: no cover - trivial
        return {
            "ok": False,
            "errors": [
                {
                    "rule": "syntax",
                    "line": exc.lineno or 0,
                    "message": f"syntax error: {exc.msg}",
                }
            ],
        }

    whitelist: set[str] = set(policy.get("module_whitelist", []))
    forbidden_modules: set[str] = set(policy.get("forbidden_modules", []))
    forbidden_builtins: set[str] = set(policy.get("forbidden_builtins", []))

    def is_module_allowed(dotted: str) -> bool:
        """Walk from root to the given dotted path; any prefix in the whitelist counts."""
        parts = dotted.split(".")
        for i in range(1, len(parts) + 1):
            prefix = ".".join(parts[:i])
            if prefix in forbidden_modules:
                return False
        for i in range(1, len(parts) + 1):
            prefix = ".".join(parts[:i])
            if prefix in whitelist:
                return True
        return False

    for node in ast.walk(tree):
        # 1. Imports ---------------------------------------------------
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.name
                if name.split(".")[0] in forbidden_modules:
                    errors.append({
                        "rule": "forbidden_module",
                        "line": node.lineno,
                        "message": f"forbidden import: {name}",
                    })
                elif not is_module_allowed(name):
                    errors.append({
                        "rule": "module_not_whitelisted",
                        "line": node.lineno,
                        "message": f"module not on whitelist: {name}",
                    })
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            root = mod.split(".")[0] if mod else ""
            if root in forbidden_modules:
                errors.append({
                    "rule": "forbidden_module",
                    "line": node.lineno,
                    "message": f"forbidden import: {mod}",
                })
            elif mod and not is_module_allowed(mod):
                errors.append({
                    "rule": "module_not_whitelisted",
                    "line": node.lineno,
                    "message": f"module not on whitelist: {mod}",
                })

        # 2. Forbidden builtin calls ----------------------------------
        elif isinstance(node, ast.Call):
            func = node.func
            name = None
            if isinstance(func, ast.Name):
                name = func.id
            elif isinstance(func, ast.Attribute):
                # Block attribute-chain forms like builtins.exec(...)
                name = func.attr
            if name and name in forbidden_builtins:
                errors.append({
                    "rule": "forbidden_call",
                    "line": node.lineno,
                    "message": f"forbidden builtin call: {name}",
                })

        # 3. Dunder attribute access that's typically abused -----------
        elif isinstance(node, ast.Attribute):
            danger_attrs = {"__import__", "__class__", "__bases__", "__subclasses__", "__globals__"}
            if node.attr in danger_attrs:
                errors.append({
                    "rule": "forbidden_attribute",
                    "line": node.lineno,
                    "message": f"forbidden attribute access: {node.attr}",
                })

        # 4. Name reference to forbidden builtin (without call) --------
        elif isinstance(node, ast.Name):
            if node.id in forbidden_builtins:
                errors.append({
                    "rule": "forbidden_name",
                    "line": node.lineno,
                    "message": f"forbidden name reference: {node.id}",
                })

    # Dedup — multiple walks can report the same spot twice.
    seen: set[tuple[str, int, str]] = set()
    deduped = []
    for e in errors:
        k = (e["rule"], e["line"], e["message"])
        if k not in seen:
            seen.add(k)
            deduped.append(e)

    return {"ok": len(deduped) == 0, "errors": deduped}


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({
            "ok": False,
            "errors": [{"rule": "internal", "line": 0,
                        "message": "usage: ast_checker.py <policy_json>"}],
        }))
        return 0
    try:
        policy = json.loads(sys.argv[1])
    except json.JSONDecodeError as exc:
        print(json.dumps({
            "ok": False,
            "errors": [{"rule": "internal", "line": 0,
                        "message": f"bad policy json: {exc}"}],
        }))
        return 0

    source = sys.stdin.read()
    verdict = check(source, policy)
    print(json.dumps(verdict))
    return 0


if __name__ == "__main__":
    sys.exit(main())
