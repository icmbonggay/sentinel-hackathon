import re
import subprocess
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

router = APIRouter()

# Strict allowlist: hostnames and IPv4 addresses only, no shell metacharacters
_ALLOWED_HOST = re.compile(r"^[a-zA-Z0-9.\-]{1,253}$")


@router.get("/lookup", response_class=PlainTextResponse)
def lookup(host: str):
    # FIXED: input validated + shell=False prevents command injection (Sentinel F-03)
    if not _ALLOWED_HOST.match(host):
        raise HTTPException(status_code=400, detail="Invalid host parameter")

    result = subprocess.run(
        ["ping", "-c", "1", host],
        shell=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    return result.stdout + result.stderr
