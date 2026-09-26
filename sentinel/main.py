# sentinel/main.py
"""
FastAPI orchestrator for the Sentinel security assessment platform.

Endpoints:
  GET  /status                 – runtime config: target URL, modules, version
  POST /start                  – run a full assessment against the target app
  GET  /findings               – read the current findings from disk
  POST /apply-fix/{finding_id} – patch, retest, and verify a single finding
  GET  /source/{finding_id}    – return original + patched source for a finding

Run with:
  uvicorn sentinel.main:app --port 8000 --reload

Environment variables:
  TARGET_URL   – URL of the target application (default: http://localhost:8001)
"""
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from sentinel.state_machine import (
    apply_fix,
    get_findings,
    start_assessment,
    ATTACK_MODULES,
    PATCH_MAP,
    PATCHES_DIR,
    REPO_ROOT,
    TARGET_URL,
)

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(title="Sentinel Security Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/status")
def status():
    """Return runtime configuration consumed by the frontend."""
    return {
        "target_url": TARGET_URL,
        "attack_modules": ATTACK_MODULES,
        "sentinel_version": "2.0",
    }


@app.post("/start")
def start():
    """Run the full assessment and return all findings."""
    try:
        findings = start_assessment()
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [f.model_dump() for f in findings]


@app.get("/findings")
def findings():
    """Return the findings currently stored in findings.json."""
    return [f.model_dump() for f in get_findings()]


@app.post("/apply-fix/{finding_id}")
def fix(finding_id: str):
    """
    Apply the patch for a single finding, smoke-test the app, retest the
    attack, and return the updated Finding with its new status.
    """
    try:
        updated = apply_fix(finding_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return updated.model_dump()


_ORIGINALS_DIR = REPO_ROOT / "target_app" / "routes" / "_originals"


@app.get("/source/{finding_id}")
def source(finding_id: str):
    """
    Return the original (vulnerable) and patched source files for a finding.
    Uses the existing PATCH_MAP so there is no hardcoded per-finding logic here.
    """
    if finding_id not in PATCH_MAP:
        raise HTTPException(status_code=404, detail=f"No source mapping for '{finding_id}'")

    patch_filename, route_filename, _module = PATCH_MAP[finding_id]
    original_path = _ORIGINALS_DIR / route_filename
    patched_path  = PATCHES_DIR    / patch_filename

    if not original_path.exists():
        raise HTTPException(status_code=404, detail=f"Original source not found: {original_path.name}")
    if not patched_path.exists():
        raise HTTPException(status_code=404, detail=f"Patch file not found: {patched_path.name}")

    return {
        "original": original_path.read_text(encoding="utf-8"),
        "patched":  patched_path.read_text(encoding="utf-8"),
    }


# ── Serve frontend ────────────────────────────────────────────────────
if FRONTEND_DIR.is_dir():
    @app.get("/")
    def ui():
        """Serve the Sentinel frontend dashboard."""
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    # Mount frontend assets last so API routes take priority
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")
