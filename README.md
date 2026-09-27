# Sentinel — Automated Security Assessment Platform

> **Hackathon demo** · Powered by [IBM Bob 2.0](https://www.ibm.com/products/bob)

Sentinel is a fully automated security assessment platform that discovers vulnerabilities in a running web application, performs root-cause analysis, generates and applies patches, and verifies the fix — all without human intervention.

The platform showcases **IBM Bob 2.0** as the AI engine: Bob drives the entire pipeline through a custom MCP server, reading live source code, writing patches, and retesting attacks in a tight feedback loop.

---

## Key Features

| Feature | Description |
|---|---|
| **Automated Attack Detection** | Three deterministic attack scripts (SQLi, IDOR, Command Injection) probe the target and produce structured evidence |
| **Root-Cause Analysis** | Each finding is enriched with a precise root-cause and remediation recommendation |
| **Patch Generation** | Pre-built patches in `patches/` replace the vulnerable route files in-place |
| **Live Hot-Reload** | The target app reloads patched modules at runtime — no restart required |
| **Retest & Verification** | The original attack is re-run after patching; `verified` status is only set when the exploit no longer succeeds |
| **One-Click Reset** | `POST /reset` (or `bash reset.sh`) restores all route files and seed data instantly |

---

## Architecture

```
sentinel-hackathon/
├── target_app/          # Intentionally vulnerable FastAPI application (port 8001)
├── sentinel/            # Sentinel orchestrator + MCP server (port 8000)
├── frontend/            # Static dashboard served by the Sentinel backend
└── patches/             # Pre-built secure replacements for each vulnerable route
```

### How the components interact

```
Browser
  │  GET /  (static dashboard)
  ▼
sentinel/main.py  (port 8000)
  │  POST /start → state_machine.start_assessment()
  │    ├─ POST target_app/reset          (wipe DB + restore originals)
  │    ├─ attacks/sqli.py  → POST /login
  │    ├─ attacks/idor.py  → GET  /profile/{id}
  │    └─ attacks/cmdi.py  → GET  /lookup?host=…
  │
  │  POST /apply-fix/{id} → state_machine.apply_fix()
  │    ├─ copies patches/<name>_fixed.py → target_app/routes/<name>.py
  │    ├─ POST target_app/internal/reload/{module}
  │    └─ re-runs attack script → sets status: verified | fixed
  │
  └─ Bob 2.0 (MCP)
       ├─ get_vulnerable_code(finding_id)
       ├─ propose_patch(finding_id, patched_code)
       └─ run_retest(finding_id)
            ▼
         target_app/main.py  (port 8001)
           ├── POST /login
           ├── GET  /profile/{user_id}
           ├── GET  /lookup
           ├── POST /internal/reload/{module}
           └── POST /reset
```

**`target_app/`** — A FastAPI application backed by SQLite (`target_app.db`). It ships with three intentionally vulnerable route files under `target_app/routes/` and pristine copies stored in `target_app/routes/_originals/` for reset.

**`sentinel/`** — The orchestrator. `state_machine.py` drives the full lifecycle (scan → remediate → retest → verify). `main.py` exposes the REST API consumed by the frontend. `mcp_server.py` exposes three MCP tools so Bob 2.0 can operate the platform programmatically.

**`frontend/`** — A single-page dashboard (`index.html` + `app.js` + `style.css`) served as static files by the Sentinel backend. No build step required.

**`patches/`** — Three drop-in Python modules (`auth_fixed.py`, `profile_fixed.py`, `utils_fixed.py`) that replace the vulnerable routes. The state machine copies the relevant file at remediation time and triggers a live reload.

---

## Seeded Vulnerabilities

### F-01 · SQL Injection — `POST /login` · **Critical**

**Vulnerable code** (`target_app/routes/auth.py`):
```python
query = f"SELECT * FROM users WHERE username='{body.username}' AND password='{body.password}'"
```

**Exploit payload:**
```json
{ "username": "alice", "password": "wrong' OR '1'='1' --" }
```
The injected `OR '1'='1'` always evaluates to true, bypassing authentication entirely.

**Fix** (`patches/auth_fixed.py`): parameterised query — user input is passed as data, never interpreted as SQL.

---

### F-02 · IDOR — `GET /profile/{user_id}` · **High**

**Vulnerable code** (`target_app/routes/profile.py`):
```python
@router.get("/profile/{user_id}")
def get_profile(user_id: int):
    # No ownership check — any caller can read any user's notes
```

**Exploit:** `GET /profile/2` with zero authentication returns Bob's private notes.

**Fix** (`patches/profile_fixed.py`): reads the `Authorization: Bearer <token>` header, resolves the caller's `user_id`, and returns `401` / `403` for missing or mismatched tokens.

---

### F-03 · Command Injection — `GET /lookup?host=…` · **Critical**

**Vulnerable code** (`target_app/routes/utils.py`):
```python
result = subprocess.run(f"{_PING_CMD} {host}", shell=True, ...)
```

**Exploit payload:** `host=127.0.0.1 ; echo SENTINEL_CMDI_<marker>`  
The shell separator appends an arbitrary command; the marker string appears in the response, proving arbitrary execution.

**Fix** (`patches/utils_fixed.py`): strict hostname allowlist regex + `shell=False` with the host passed as a list argument.

---

## Assessment Workflow

```
RECON ──► ATTACK ──► ANALYZE ──► REMEDIATE ──► VERIFY
```

| Phase | What happens |
|---|---|
| **Recon** | `POST /reset` wipes the DB and restores vulnerable route files |
| **Attack** | All three attack scripts run; each returns `vulnerable`, `evidence`, and an `error` field |
| **Analyze** | Findings are enriched with `root_cause` and `recommended_remediation`, then persisted to `findings.json` |
| **Remediate** | `POST /apply-fix/{id}` copies the patch, triggers `POST /internal/reload/{module}`, and smoke-tests the app |
| **Verify** | The same attack script reruns against the patched app; status becomes `verified` only when `vulnerable=false` |

Finding statuses:

| Status | Meaning |
|---|---|
| `vulnerable` | Exploit confirmed, no fix applied yet |
| `fixed` | Patch applied; smoke test passed, but retest was inconclusive or errored |
| `verified` | Patch applied and the attack no longer succeeds |

---

## Requirements

### Python

Python **3.11+** is required (uses `str.removeprefix`, `match` expressions, and modern type-hint syntax).

### Dependencies

**Target app** (`target_app/requirements.txt`):
```
fastapi
uvicorn[standard]
pydantic
```

**Sentinel** (`sentinel/requirements.txt`):
```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
requests>=2.31.0
pydantic>=2.6.0
mcp[cli]>=1.0.0
```

### System tools

| Tool | Used by |
|---|---|
| `ping` | `target_app/routes/utils.py` (the vulnerable endpoint itself) |
| `bash` | `reset.sh` (optional convenience script) |

---

## Setup & Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd sentinel-hackathon

# 2. Create and activate a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate       # macOS / Linux
# .venv\Scripts\Activate.ps1   # Windows PowerShell

# 3. Install all dependencies
pip install -r target_app/requirements.txt -r sentinel/requirements.txt

# 4. Initialise the database and restore the vulnerable route files
bash reset.sh
# Windows (no bash): run the equivalent Python one-liner
# python -c "from target_app.db import init_db; init_db()"
```

---

## Running the System

Open **two terminals** from the repository root (with the virtual environment active).

**Terminal 1 — Target app** (the application under test):
```bash
uvicorn target_app.main:app --port 8001 --reload
```

**Terminal 2 — Sentinel backend + frontend**:
```bash
uvicorn sentinel.main:app --port 8000 --reload
```

Open the dashboard in your browser:
```
http://localhost:8000
```

The Sentinel API docs (Swagger UI) are available at:
```
http://localhost:8000/docs
http://localhost:8001/docs   # target app
```

---

## Using Sentinel

### 1. Start an assessment

In the dashboard click **Start Assessment**, or call the API directly:

```bash
curl -X POST http://localhost:8000/start
```

Sentinel resets the target app, runs all three attacks, and populates `findings.json`. The dashboard shows each finding with its severity, affected component, and the captured evidence.

### 2. Review findings

```bash
curl http://localhost:8000/findings
```

Each finding includes:
- `finding_id` — `F-01` / `F-02` / `F-03`
- `severity` — `Critical` or `High`
- `affected_component` — file and endpoint
- `evidence` — the exact payloads and responses that proved exploitability
- `root_cause` and `recommended_remediation`
- `status` — `vulnerable` / `fixed` / `verified`

### 3. Apply a fix

Click **Apply Fix** next to a finding in the dashboard, or:

```bash
curl -X POST http://localhost:8000/apply-fix/F-01
curl -X POST http://localhost:8000/apply-fix/F-02
curl -X POST http://localhost:8000/apply-fix/F-03
```

Sentinel copies the patch, hot-reloads the module, smoke-tests the app, re-runs the attack, and updates the finding status.

### 4. View source diff

```bash
curl http://localhost:8000/source/F-01   # returns { "original": "...", "patched": "..." }
```

### 5. Reset the demo

```bash
bash reset.sh
# or
curl -X POST http://localhost:8001/reset
```

This restores all route files and reinitialises the database — ready for a fresh run.

---

## API Endpoints

### Sentinel (port 8000)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serve the frontend dashboard |
| `GET` | `/status` | Runtime config: target URL, attack modules, version |
| `POST` | `/start` | Run the full assessment; returns all findings |
| `GET` | `/findings` | Read current findings from `findings.json` |
| `POST` | `/apply-fix/{finding_id}` | Patch, reload, smoke-test, retest, and verify one finding |
| `GET` | `/source/{finding_id}` | Return original and patched source for a finding |

### Target app (port 8001)

| Method | Path | Description |
|---|---|---|
| `POST` | `/login` | Authenticate (vulnerable: SQLi) |
| `GET` | `/profile/{user_id}` | Fetch a user's notes (vulnerable: IDOR) |
| `GET` | `/lookup` | Ping a host (vulnerable: Command Injection) |
| `POST` | `/internal/reload/{module}` | Hot-reload a patched route module |
| `POST` | `/reset` | Restore DB and route files to seed state |

---

## Testing

### Run the attack scripts directly

Each attack module has a `__main__` entry point for standalone testing:

```bash
# SQL Injection
python -m sentinel.attacks.sqli

# IDOR
python -m sentinel.attacks.idor

# Command Injection
python -m sentinel.attacks.cmdi
```

Each script prints a JSON result with `vulnerable`, `evidence`, and `error` fields.

### Verify a finding is fixed

1. Apply the fix for a finding (see above).
2. Re-run the corresponding attack script — `vulnerable` must be `false`.
3. Check the finding status via `GET /findings` — it must be `verified`.

### Full cycle test

```bash
# Reset to vulnerable state
curl -X POST http://localhost:8001/reset

# Run full assessment (all three attacks)
curl -X POST http://localhost:8000/start

# Apply all three fixes
curl -X POST http://localhost:8000/apply-fix/F-01
curl -X POST http://localhost:8000/apply-fix/F-02
curl -X POST http://localhost:8000/apply-fix/F-03

# Confirm all findings are verified
curl http://localhost:8000/findings | python3 -m json.tool
```

All three findings should show `"status": "verified"`.

---

## Project Structure

```
sentinel-hackathon/
│
├── target_app/                   # Vulnerable FastAPI application
│   ├── main.py                   # App factory, /reset, /internal/reload
│   ├── db.py                     # SQLite connection + init_db()
│   ├── seed.sql                  # Schema + seed users/notes
│   ├── requirements.txt
│   └── routes/
│       ├── auth.py               # POST /login          (F-01: SQLi)
│       ├── profile.py            # GET  /profile/{id}   (F-02: IDOR)
│       ├── utils.py              # GET  /lookup         (F-03: CmdI)
│       └── _originals/           # Pristine copies used by /reset
│
├── sentinel/                     # Orchestrator + MCP server
│   ├── main.py                   # FastAPI REST API (port 8000)
│   ├── state_machine.py          # Assessment lifecycle logic
│   ├── models.py                 # Finding Pydantic model
│   ├── mcp_server.py             # Bob 2.0 MCP tools
│   ├── requirements.txt
│   └── attacks/
│       ├── sqli.py               # F-01 attack script
│       ├── idor.py               # F-02 attack script
│       └── cmdi.py               # F-03 attack script
│
├── patches/                      # Secure drop-in replacements
│   ├── auth_fixed.py             # Parameterised query
│   ├── profile_fixed.py          # Ownership check + 401/403
│   └── utils_fixed.py            # Allowlist + shell=False
│
├── frontend/                     # Single-page dashboard
│   ├── index.html
│   ├── app.js
│   └── style.css
│
├── findings.json                 # Live assessment output (auto-generated)
├── target_app.db                 # SQLite database (auto-generated)
├── reset.sh                      # Full demo reset script
└── README.md
```

---

## Important Notes

> **This is a controlled local sandbox.**

- All vulnerabilities in `target_app/` are **intentionally seeded** for demonstration purposes. They exist solely to showcase Sentinel's detection and remediation capabilities.
- The application listens on `localhost` only. Do **not** expose either server to a network — the target app contains real, exploitable code.
- The authentication tokens (`mock-session-token-*`) and SQLite database are not suitable for any purpose other than this demo.
- `findings.json` and `target_app.db` are generated at runtime and are not committed in a clean state by design — run `bash reset.sh` before every demo walkthrough to guarantee a reproducible starting point.
- The MCP server (`sentinel/mcp_server.py`) is designed to be spawned by Bob 2.0 via `stdio` transport. It does not need to be started manually when using the REST + frontend path.
