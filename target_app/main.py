import shutil
import os
from fastapi import FastAPI
from target_app.db import init_db
from target_app.routes import auth, profile, utils

app = FastAPI(title="Sentinel Target App")

# Register routers
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(utils.router)

# Paths used by /reset
ROUTES_DIR = os.path.join(os.path.dirname(__file__), "routes")
ORIGINALS_DIR = os.path.join(ROUTES_DIR, "_originals")
ROUTE_FILES = ["auth.py", "profile.py", "utils.py"]


@app.on_event("startup")
def startup():
    init_db()


@app.post("/reset")
def reset():
    """Restore the database and all route files to their pristine state."""
    # 1. Rebuild the database with seed data
    init_db()

    # 2. Overwrite live route files with the originals
    for filename in ROUTE_FILES:
        src = os.path.join(ORIGINALS_DIR, filename)
        dst = os.path.join(ROUTES_DIR, filename)
        shutil.copy2(src, dst)

    return {"status": "reset complete", "restored_files": ROUTE_FILES}
