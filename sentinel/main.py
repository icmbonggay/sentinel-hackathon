# sentinel/main.py
"""
FastAPI orchestrator for the Sentinel security assessment platform.

Endpoints:
  POST /start                  – run a full assessment against the target app
  GET  /findings               – read the current findings from disk
  POST /apply-fix/{finding_id} – patch, retest, and verify a single finding

Run with:
  uvicorn sentinel.main:app --port 8000 --reload
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from sentinel.state_machine import apply_fix, get_findings, start_assessment

app = FastAPI(title="Sentinel Security Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
