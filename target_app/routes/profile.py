from fastapi import APIRouter
from target_app.db import get_connection

router = APIRouter()


@router.get("/profile/{user_id}")
def get_profile(user_id: int):
    # VULNERABLE: IDOR - Sentinel F-02
    # No check that the requester is the owner of user_id
    conn = get_connection()
    notes = conn.execute(
        "SELECT * FROM notes WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn.close()

    return {"user_id": user_id, "notes": [dict(n) for n in notes]}
