import platform
import re
import subprocess
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

router = APIRouter()

# Strict allowlist: dotted-quad IPv4 or a simple hostname (letters,
# digits, dots, hyphens). No shell metacharacters can match this.
_HOST_PATTERN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$")


@router.get("/lookup", response_class=PlainTextResponse)
def lookup(host: str):
    # FIXED: Sentinel F-03 (OS Command Injection)
    # 1. Strict allowlist validation before the value ever reaches subprocess.
    # 2. shell=False with an argument list, so no shell is invoked at all —
    #    metacharacters like `;`, `&`, `|`, backticks have no special meaning.
    if not _HOST_PATTERN.match(host):
        raise HTTPException(
            status_code=400,
            detail="Invalid host: only letters, digits, dots and hyphens are allowed.",
        )

    flag = "-n" if platform.system() == "Windows" else "-c"
    result = subprocess.run(
        ["ping", flag, "1", host],
        shell=False,
        capture_output=True,
        text=True,
    )
    return result.stdout + result.stderr