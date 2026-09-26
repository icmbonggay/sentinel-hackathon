#!/usr/bin/env bash
# reset.sh — restore the demo to its fully-vulnerable starting state
# Run this before every demo walkthrough.
#
# What it does:
#   1. Copies the pristine vulnerable originals back over the live route files.
#   2. Resets findings.json to reflect all three findings as "vulnerable".
#   3. Reinitialises the SQLite database with seed data.
#
# Usage:
#   bash reset.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ROUTES="$REPO_ROOT/target_app/routes"
ORIGINALS="$ROUTES/_originals"

echo "==> Restoring vulnerable route files..."
cp "$ORIGINALS/auth.py"    "$ROUTES/auth.py"
cp "$ORIGINALS/profile.py" "$ROUTES/profile.py"
cp "$ORIGINALS/utils.py"   "$ROUTES/utils.py"
echo "    auth.py    -> vulnerable (SQLi)"
echo "    profile.py -> vulnerable (IDOR)"
echo "    utils.py   -> vulnerable (Command Injection)"

echo "==> Resetting findings.json to vulnerable state..."
cat > "$REPO_ROOT/findings.json" << 'FINDINGS_EOF'
[
  {
    "finding_id": "F-01",
    "title": "SQL Injection in Login Endpoint",
    "severity": "Critical",
    "affected_component": "target_app/routes/auth.py :: POST /login",
    "description": "SQL Injection in Login Endpoint",
    "evidence": {
      "control_payload": {"username": "alice", "password": "definitely_wrong_password"},
      "control_response": {"error": "Invalid credentials"},
      "exploit_payload": {"username": "alice", "password": "wrong' OR '1'='1' --"},
      "exploit_response": {"token": "mock-session-token-abc123", "user": {"id": 1, "username": "alice", "password": "alice123", "email": "alice@example.com"}}
    },
    "root_cause": "The login query is built by string-formatting user input directly into SQL, so an attacker can terminate the intended query and inject arbitrary SQL logic (e.g. OR '1'='1') to bypass authentication.",
    "recommended_remediation": "Replace the raw string query with a parameterised query or ORM call so that user input is always treated as data, never as SQL syntax.",
    "status": "vulnerable",
    "retest_result": null
  },
  {
    "finding_id": "F-02",
    "title": "Broken Object-Level Access Control (IDOR) on Profile Endpoint",
    "severity": "High",
    "affected_component": "target_app/routes/profile.py :: GET /profile/{user_id}",
    "description": "Broken Object-Level Access Control (IDOR) on Profile Endpoint",
    "evidence": {
      "requested_without_auth_as": 2,
      "response": {
        "user_id": 2,
        "notes": [
          {"id": 3, "user_id": 2, "content": "Bob note 1: shopping list"},
          {"id": 4, "user_id": 2, "content": "Bob note 2: meeting notes"}
        ]
      }
    },
    "root_cause": "The /profile/{user_id} endpoint returns the requested profile with no check that the authenticated user is the owner, allowing any unauthenticated or authenticated caller to read any user's data by simply supplying a different numeric ID.",
    "recommended_remediation": "Verify that the authenticated user's ID matches the requested user_id before returning profile data, and return 403 Forbidden for any mismatched request.",
    "status": "vulnerable",
    "retest_result": null
  },
  {
    "finding_id": "F-03",
    "title": "OS Command Injection in Diagnostic Lookup Endpoint",
    "severity": "Critical",
    "affected_component": "target_app/routes/utils.py :: GET /lookup",
    "description": "OS Command Injection in Diagnostic Lookup Endpoint",
    "evidence": {
      "payload": "127.0.0.1; echo SENTINEL_CMDI_14357f37",
      "marker_injected": "SENTINEL_CMDI_14357f37",
      "raw_output": "PING 127.0.0.1 (127.0.0.1): 56 data bytes\n64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.027 ms\n\n--- 127.0.0.1 ping statistics ---\n1 packets transmitted, 1 packets received, 0.0% packet loss\nround-trip min/avg/max/stddev = 0.027/0.027/0.027/nan ms\nSENTINEL_CMDI_14357f37\n"
    },
    "root_cause": "The /lookup endpoint passes the raw 'host' query parameter to a shell command via subprocess (or os.system) without sanitisation, allowing an attacker to append shell metacharacters and execute arbitrary OS commands.",
    "recommended_remediation": "Pass the host argument as a list element to subprocess.run with shell=False, which prevents shell interpretation of metacharacters, or validate the input strictly against a hostname/IP allowlist.",
    "status": "vulnerable",
    "retest_result": null
  }
]
FINDINGS_EOF
echo "    findings.json -> 3 findings, all status=vulnerable"

echo "==> Reinitialising database with seed data..."
cd "$REPO_ROOT"
python3 -c "
import sys
sys.path.insert(0, '.')
from target_app.db import init_db
init_db()
print('    target_app.db -> seed data restored')
"

echo ""
echo "✓ Reset complete. All three vulnerabilities are live."
echo ""
echo "  Start servers:"
echo "    Terminal 1:  uvicorn target_app.main:app --port 8001 --reload"
echo "    Terminal 2:  uvicorn sentinel.main:app   --port 8000 --reload"
echo "    Browser:     http://localhost:8000"
