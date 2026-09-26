#!/usr/bin/env python3
"""
sentinel/mcp_server.py

MCP server exposing Sentinel's three live-demo tools to Bob 2.0:

  get_vulnerable_code(finding_id)          – return the live source of the
                                             affected route so Bob can read
                                             the actual vulnerable code.

  propose_patch(finding_id, patched_code)  – write Bob's generated patch to
                                             disk and apply it to the live
                                             route file, then smoke-test the
                                             app.

  run_retest(finding_id)                   – re-execute the deterministic
                                             attack script and report whether
                                             the vulnerability is still
                                             reproducible.

Run with:
  python -m sentinel.mcp_server          (stdio transport, spawned by Bob)
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from mcp.server.mcpserver import MCPServer
from sentinel.state_machine import apply_fix

# ---------------------------------------------------------------------------
# Path constants — everything is relative to the repo root so the server
# works regardless of cwd when Bob spawns it.
# ---------------------------------------------------------------------------

REPO_ROOT     = Path(__file__).parent.parent
ROUTES_DIR    = REPO_ROOT / "target_app" / "routes"
PATCHES_DIR   = REPO_ROOT / "patches"
ORIGINALS_DIR = ROUTES_DIR / "_originals"

# finding_id -> (live route file, patch file)
_FILE_MAP: dict[str, tuple[str, str]] = {
    "F-01": ("auth.py",    "auth_fixed.py"),
    "F-02": ("profile.py", "profile_fixed.py"),
    "F-03": ("utils.py",   "utils_fixed.py"),
}

TARGET_BASE_URL = "http://localhost:8001"

# ---------------------------------------------------------------------------
# MCP server instance
# ---------------------------------------------------------------------------

server = MCPServer(
    name="sentinel-security",
    instructions=(
        "You are operating Sentinel, an automated security assessment platform. "
        "Use get_vulnerable_code to read the affected source, then propose_patch "
        "to apply your fix, then run_retest to verify the vulnerability is gone. "
        "Always call run_retest after propose_patch — never declare a finding "
        "fixed without a green retest result."
    ),
)

# ---------------------------------------------------------------------------
# Tool 1: get_vulnerable_code
# ---------------------------------------------------------------------------

@server.tool(
    description=(
        "Return the current source code of the route file affected by a finding. "
        "finding_id must be one of: F-01 (SQL injection, auth.py), "
        "F-02 (IDOR, profile.py), F-03 (command injection, utils.py). "
        "Use this to read the vulnerability before writing a patch."
    )
)
def get_vulnerable_code(finding_id: str) -> str:
    if finding_id not in _FILE_MAP:
        return json.dumps({
            "error": f"Unknown finding_id '{finding_id}'. Valid ids: {list(_FILE_MAP)}"
        })

    route_file, _ = _FILE_MAP[finding_id]
    live_path = ROUTES_DIR / route_file

    if not live_path.exists():
        return json.dumps({"error": f"Route file not found: {live_path}"})

    return json.dumps({
        "finding_id": finding_id,
        "file": str(live_path.relative_to(REPO_ROOT)),
        "source": live_path.read_text(),
    })


# ---------------------------------------------------------------------------
# Tool 2: propose_patch
# ---------------------------------------------------------------------------

@server.tool(
    description=(
        "Write a patched version of the affected route file and apply it live. "
        "finding_id: one of F-01, F-02, F-03. "
        "patched_code: the COMPLETE corrected Python source for the route module "
        "— must be a drop-in replacement keeping the same FastAPI router variable "
        "name and all existing endpoints. "
        "Always call run_retest after this tool to confirm the fix works."
    )
)
def propose_patch(finding_id: str, patched_code: str) -> str:
    import requests  # local import — only needed at call time

    if finding_id not in _FILE_MAP:
        return json.dumps({
            "error": f"Unknown finding_id '{finding_id}'. Valid ids: {list(_FILE_MAP)}"
        })

    route_file, patch_file = _FILE_MAP[finding_id]
    patch_dest = PATCHES_DIR / patch_file
    route_dest = ROUTES_DIR  / route_file

    # Persist Bob's patch and apply it over the live route file
    patch_dest.write_text(patched_code)
    shutil.copy2(patch_dest, route_dest)

    # Smoke-test: confirm the app is still alive
    try:
        if finding_id == "F-01":
            health = requests.post(
                f"{TARGET_BASE_URL}/login",
                json={"username": "alice", "password": "alice123"},
                timeout=5,
            )
            app_healthy = health.status_code == 200 and "token" in health.json()
            smoke = "pass" if app_healthy else f"fail (status={health.status_code})"
        else:
            health = requests.get(f"{TARGET_BASE_URL}/docs", timeout=5)
            app_healthy = health.status_code == 200
            smoke = "pass" if app_healthy else f"fail (status={health.status_code})"
    except requests.RequestException as exc:
        app_healthy = False
        smoke = f"error – could not reach app: {exc}"

    if not app_healthy:
        return json.dumps({
            "finding_id": finding_id,
            "patch_written_to": str(patch_dest.relative_to(REPO_ROOT)),
            "live_route_updated": str(route_dest.relative_to(REPO_ROOT)),
            "smoke_test": smoke,
            "app_healthy": False,
            "sentinel_updated": False,
            "error": "Smoke test failed — Sentinel finding not updated.",
        })

    # Invoke the normal Sentinel RELOAD → RETEST → VERIFY pipeline so the
    # finding state in findings.json is updated exactly as the frontend path.
    # apply_fix() will re-copy the patch (harmless) then reload, retest, and
    # persist the result — no logic is duplicated here.
    try:
        updated_finding = apply_fix(finding_id)
        sentinel_result = {
            "sentinel_updated": True,
            "status": updated_finding.status,
            "retest_result": updated_finding.retest_result,
        }
    except Exception as exc:
        sentinel_result = {
            "sentinel_updated": False,
            "error": f"apply_fix() raised: {exc}",
        }

    return json.dumps({
        "finding_id": finding_id,
        "patch_written_to": str(patch_dest.relative_to(REPO_ROOT)),
        "live_route_updated": str(route_dest.relative_to(REPO_ROOT)),
        "smoke_test": smoke,
        "app_healthy": app_healthy,
        **sentinel_result,
    })


# ---------------------------------------------------------------------------
# Tool 3: run_retest
# ---------------------------------------------------------------------------

@server.tool(
    description=(
        "Re-run the deterministic attack script for a finding against the live app. "
        "finding_id: one of F-01, F-02, F-03. "
        "Returns the raw attack result including vulnerable (bool) and evidence. "
        "vulnerable=false means the fix worked. Use this after propose_patch."
    )
)
def run_retest(finding_id: str) -> str:
    if finding_id not in _FILE_MAP:
        return json.dumps({
            "error": f"Unknown finding_id '{finding_id}'. Valid ids: {list(_FILE_MAP)}"
        })

    if finding_id == "F-01":
        from sentinel.attacks.sqli import attack
    elif finding_id == "F-02":
        from sentinel.attacks.idor import attack
    else:
        from sentinel.attacks.cmdi import attack

    result = attack(TARGET_BASE_URL)

    if result.get("error"):
        result["verdict"] = (
            f"ERROR – attack script could not reach the app: {result['error']}"
        )
    elif result.get("vulnerable"):
        result["verdict"] = "VULNERABLE – the fix did not eliminate the vulnerability."
    else:
        result["verdict"] = (
            "VERIFIED – vulnerability no longer reproducible. Finding is fixed."
        )

    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    server.run(transport="stdio")
