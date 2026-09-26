import os
import subprocess
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter()


@router.get("/lookup", response_class=PlainTextResponse)
def lookup(host: str):
    # VULNERABLE: Command Injection - Sentinel F-03
    # Shell is invoked with an unsanitized user-supplied value
    result = subprocess.run(
        f"ping -c 1 {host}",
        shell=True,
        capture_output=True,
        text=True,
    )
    return result.stdout + result.stderr
