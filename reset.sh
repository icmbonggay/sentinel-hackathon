#!/usr/bin/env bash
# reset.sh — restore the demo to its fully-vulnerable starting state
# Run this before every demo walkthrough.
#
# What it does:
#   1. Copies the pristine vulnerable originals back over the live route files.
#   2. Reinitialises the SQLite database with seed data.
#
# Note: findings.json is cleared here so the frontend always starts at step 1.
#
# Usage:
#   bash reset.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ROUTES="$REPO_ROOT/target_app/routes"
ORIGINALS="$ROUTES/_originals"

echo "==> Clearing previous findings..."
rm -f "$REPO_ROOT/findings.json"
echo "    findings.json -> cleared"

echo "==> Restoring vulnerable route files..."
cp "$ORIGINALS/auth.py"    "$ROUTES/auth.py"
cp "$ORIGINALS/profile.py" "$ROUTES/profile.py"
cp "$ORIGINALS/utils.py"   "$ROUTES/utils.py"
echo "    auth.py    -> vulnerable (SQLi)"
echo "    profile.py -> vulnerable (IDOR)"
echo "    utils.py   -> vulnerable (Command Injection)"

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
