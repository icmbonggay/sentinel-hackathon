import sys
import subprocess
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter()

# Platform-appropriate ping base command (shell=True so injection is possible)
_PING_CMD = "ping -n 1" if sys.platform == "win32" else "ping -c 1"


@router.get("/lookup", response_class=PlainTextResponse)
def lookup(host: str):
    # VULNERABLE: Command Injection - Sentinel F-03
    # Shell is invoked with an unsanitized user-supplied value
    result = subprocess.run(
        f"{_PING_CMD} {host}",
        shell=True,
        capture_output=True,
        text=True,
    )
    return result.stdout + result.stderr
