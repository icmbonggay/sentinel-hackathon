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

    # VULNERABLE: SQLi - Sentinel F-01
    query = f"SELECT * FROM users WHERE username='{body.username}' AND password='{body.password}'"
    row = conn.execute(query).fetchone()
    conn.close()

    if row is None:
        return {"error": "Invalid credentials"}

    return {
        "token": "mock-session-token-abc123",
        "user": dict(row),
    }
