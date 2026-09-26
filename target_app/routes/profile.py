from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from target_app.db import get_connection

router = APIRouter()

# Mock token -> user_id map matching the seed data and the auth route's token
_TOKEN_TO_USER: dict[str, int] = {
    "mock-session-token-abc123": 1,  # alice
    "mock-session-token-bob456": 2,  # bob
}


def _get_current_user_id(authorization: Optional[str]) -> Optional[int]:
    """Return the user_id for a Bearer token, or None if missing/invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    return _TOKEN_TO_USER.get(token)


@router.get("/profile/{user_id}")
def get_profile(user_id: int, authorization: Optional[str] = Header(default=None)):
    # FIXED: ownership check prevents IDOR (Sentinel F-02)
    current_user_id = _get_current_user_id(authorization)
    if current_user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if current_user_id != user_id:
        raise HTTPException(status_code=403, detail="Access forbidden")

    conn = get_connection()
    notes = conn.execute(
        "SELECT * FROM notes WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn.close()

    return {"user_id": user_id, "notes": [dict(n) for n in notes]}
