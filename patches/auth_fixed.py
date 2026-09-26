from fastapi import APIRouter
from pydantic import BaseModel
from target_app.db import get_connection

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest):
    conn = get_connection()

    # FIXED: parameterised query prevents SQL injection (Sentinel F-01)
    row = conn.execute(
        "SELECT * FROM users WHERE username = ? AND password = ?",
        (body.username, body.password),
    ).fetchone()
    conn.close()

    if row is None:
        return {"error": "Invalid credentials"}

    return {
        "token": f"mock-session-token-{row['id']}",
        "user": dict(row),
    }
