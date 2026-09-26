from fastapi import APIRouter, HTTPException, Header
from target_app.db import get_connection

router = APIRouter()


@router.get("/profile/{user_id}")
def get_profile(user_id: int, x_user_id: int = Header(...)):
    # FIXED: Sentinel F-02 (IDOR)
    # The caller must identify themselves via the X-User-Id header, and
    # that identity must match the user_id being requested. There's no
    # real auth/session system in this demo app, so this header is a
    # stand-in for "the authenticated caller's own ID" — in production
    # this would come from a verified session/JWT, never a raw header.
    if x_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: you can only access your own profile.",
        )

    conn = get_connection()
    notes = conn.execute(
        "SELECT * FROM notes WHERE user_id = ?", (user_id,)
    ).fetchall()
    conn.close()

    return {"user_id": user_id, "notes": [dict(n) for n in notes]}