# sentinel/state_machine.py
"""
Orchestrates the full Sentinel assessment lifecycle:

  SCAN       -> start_assessment()   – run all attack scripts, persist findings
  READ       -> get_findings()       – load persisted findings
  REMEDIATE  -> apply_fix()          – patch the target app route file
  RETEST     -> (inside apply_fix)   – re-run the original attack
  VERIFY     -> (inside apply_fix)   – decide verified vs fixed-not-verified
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Optional

import requests

from sentinel.attacks.cmdi import attack as cmdi_attack
from sentinel.attacks.idor import attack as idor_attack
from sentinel.attacks.sqli import attack as sqli_attack
from sentinel.models import Finding

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent.parent          # …/sentinel-hackathon/
FINDINGS_FILE = REPO_ROOT / "findings.json"

PATCHES_DIR = REPO_ROOT / "patches"
ROUTES_DIR  = REPO_ROOT / "target_app" / "routes"

# Map finding_id -> (patch filename, live route filename)
PATCH_MAP = {
    "F-01": ("auth_fixed.py",    "auth.py"),
    "F-02": ("profile_fixed.py", "profile.py"),
    "F-03": ("utils_fixed.py",   "utils.py"),
}

# ---------------------------------------------------------------------------
# Per-vulnerability analysis text (ANALYZE + REPORT phase)
# ---------------------------------------------------------------------------

ANALYSIS = {
    "F-01": {
        "root_cause": (
            "The login query is built by string-formatting user input directly "
            "into SQL, so an attacker can terminate the intended query and inject "
            "arbitrary SQL logic (e.g. OR '1'='1') to bypass authentication."
        ),
        "recommended_remediation": (
            "Replace the raw string query with a parameterised query or ORM "
            "call so that user input is always treated as data, never as SQL syntax."
        ),
    },
    "F-02": {
        "root_cause": (
            "The /profile/{user_id} endpoint returns the requested profile with "
            "no check that the authenticated user is the owner, allowing any "
            "unauthenticated or authenticated caller to read any user's data by "
            "simply supplying a different numeric ID."
        ),
        "recommended_remediation": (
            "Verify that the authenticated user's ID matches the requested "
            "user_id before returning profile data, and return 403 Forbidden for "
            "any mismatched request."
        ),
    },
    "F-03": {
        "root_cause": (
            "The /lookup endpoint passes the raw 'host' query parameter to a "
            "shell command via subprocess (or os.system) without sanitisation, "
            "allowing an attacker to append shell metacharacters and execute "
            "arbitrary OS commands."
        ),
        "recommended_remediation": (
            "Pass the host argument as a list element to subprocess.run with "
            "shell=False, which prevents shell interpretation of metacharacters, "
            "or validate the input strictly against a hostname/IP allowlist."
        ),
    },
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _save_findings(findings: list[Finding]) -> None:
    """Serialise findings list to findings.json."""
    FINDINGS_FILE.write_text(
        json.dumps([f.model_dump() for f in findings], indent=2)
    )


def _load_raw() -> list[dict]:
    """Return raw dicts from findings.json, or empty list if missing."""
    if not FINDINGS_FILE.exists():
        return []
    return json.loads(FINDINGS_FILE.read_text())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_assessment(base_url: str = "http://localhost:8001") -> list[Finding]:
    """
    SCAN phase.

    1. POST /reset to wipe the target app back to its seed state.
    2. Clear any previous findings.json.
    3. Run all three attacks.
    4. For each vulnerable finding, build a Finding with analysis text.
    5. Persist and return the list.
    """
    # --- reset target app ---
    try:
        resp = requests.post(f"{base_url}/reset", timeout=10)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"Could not reset target app at {base_url}: {exc}") from exc

    # --- clear stale findings ---
    if FINDINGS_FILE.exists():
        FINDINGS_FILE.unlink()

    # --- run attacks ---
    raw_results = [
        sqli_attack(base_url),
        idor_attack(base_url),
        cmdi_attack(base_url),
    ]

    findings: list[Finding] = []
    for result in raw_results:
        if result.get("error"):
            # Surface the error as a non-vulnerable finding so it isn't lost
            finding = Finding(
                finding_id=result["finding_id"],
                title=result["title"],
                severity=result["severity"],
                affected_component=result["affected_component"],
                description=f"Attack script error: {result['error']}",
                evidence=None,
                root_cause="N/A – attack script could not reach the target.",
                recommended_remediation="Ensure the target app is running and reachable.",
                status="fixed",   # not confirmed vulnerable
                retest_result=result["error"],
            )
            findings.append(finding)
        elif result.get("vulnerable"):
            analysis = ANALYSIS[result["finding_id"]]
            finding = Finding.from_attack_result(
                result,
                root_cause=analysis["root_cause"],
                remediation=analysis["recommended_remediation"],
            )
            findings.append(finding)
        # If not vulnerable and no error, the finding is clean – skip it

    _save_findings(findings)
    return findings


def get_findings() -> list[Finding]:
    """
    Return whatever findings are currently stored in findings.json.
    """
    return [Finding(**raw) for raw in _load_raw()]


def apply_fix(
    finding_id: str,
    base_url: str = "http://localhost:8001",
) -> Finding:
    """
    REMEDIATE -> TEST -> RETEST -> VERIFY pipeline for a single finding.

    Raises ValueError if finding_id is unknown or not in findings.json.
    All step failures are recorded in retest_result rather than silently swallowed.
    """
    # --- load current findings ---
    raw_findings = _load_raw()
    target: Optional[dict] = next(
        (f for f in raw_findings if f["finding_id"] == finding_id), None
    )
    if target is None:
        raise ValueError(f"No finding with id '{finding_id}' in findings.json")

    if finding_id not in PATCH_MAP:
        raise ValueError(f"No patch mapping defined for finding id '{finding_id}'")

    patch_filename, route_filename = PATCH_MAP[finding_id]
    patch_src  = PATCHES_DIR / patch_filename
    route_dest = ROUTES_DIR  / route_filename

    # --- REMEDIATE: copy patch over live route file ---
    if not patch_src.exists():
        target["status"] = "fixed"
        target["retest_result"] = (
            f"Patch file '{patch_src}' does not exist yet. "
            "Add it to patches/ and re-run apply_fix."
        )
        _save_findings([Finding(**f) for f in raw_findings])
        return Finding(**target)

    shutil.copy2(patch_src, route_dest)

    # --- TEST: confirm the app still accepts a valid login after patching ---
    app_healthy = False
    health_error: Optional[str] = None
    try:
        health = requests.post(
            f"{base_url}/login",
            json={"username": "alice", "password": "alice123"},
            timeout=5,
        )
        app_healthy = health.status_code == 200 and "token" in health.json()
        if not app_healthy:
            health_error = (
                f"Post-patch smoke test failed: status={health.status_code} "
                f"body={health.text[:200]}"
            )
    except requests.RequestException as exc:
        health_error = f"Post-patch smoke test could not reach app: {exc}"

    if not app_healthy:
        target["status"] = "fixed"
        target["retest_result"] = (
            f"Patch was applied but the app appears broken. {health_error}"
        )
        _save_findings([Finding(**f) for f in raw_findings])
        return Finding(**target)

    # --- RETEST: re-run the original attack against the patched app ---
    attack_fn = {"F-01": sqli_attack, "F-02": idor_attack, "F-03": cmdi_attack}[finding_id]
    retest = attack_fn(base_url)

    if retest.get("error"):
        target["status"] = "fixed"
        target["retest_result"] = (
            f"Patch applied and app healthy, but retest attack script errored: "
            f"{retest['error']}"
        )
    elif not retest.get("vulnerable"):
        # --- VERIFY: vulnerability is gone ---
        target["status"] = "verified"
        target["retest_result"] = (
            "Re-ran attack after patching; vulnerability no longer reproducible."
        )
    else:
        # Patch was applied but the vulnerability is still present
        target["status"] = "fixed"
        target["retest_result"] = (
            "Patch was applied but the vulnerability is still reproducible. "
            f"Retest evidence: {retest.get('evidence')}"
        )

    _save_findings([Finding(**f) for f in raw_findings])
    return Finding(**target)
