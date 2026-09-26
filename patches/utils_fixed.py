import re
import sys
import subprocess
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

router = APIRouter()

# Strict allowlist: hostnames and IPv4 addresses only, no shell metacharacters
_ALLOWED_HOST = re.compile(r"^[a-zA-Z0-9.\-]{1,253}$")

# Platform-appropriate ping arguments (no shell=True so metacharacters are inert)
_PING_CMD = (
    ["ping", "-n", "1"] if sys.platform == "win32" else ["ping", "-c", "1"]
)


@router.get("/lookup", response_class=PlainTextResponse)
def lookup(host: str):
    # FIXED: input validated + shell=False prevents command injection (Sentinel F-03)
    if not _ALLOWED_HOST.match(host):
        raise HTTPException(status_code=400, detail="Invalid host parameter")

    result = subprocess.run(
        _PING_CMD + [host],
        shell=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    return result.stdout + result.stderr
