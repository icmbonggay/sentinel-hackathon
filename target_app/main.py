import importlib
import shutil
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from target_app.db import init_db
from target_app.routes import auth, profile, utils


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Sentinel Target App", lifespan=lifespan)

# Register routers
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(utils.router)

# Paths used by /reset
ROUTES_DIR = os.path.join(os.path.dirname(__file__), "routes")
ORIGINALS_DIR = os.path.join(ROUTES_DIR, "_originals")
ROUTE_FILES = ["auth.py", "profile.py", "utils.py"]

# Module objects matched to their filenames so /reset can reload them
_ROUTE_MODULES = {
    "auth.py":    auth,
    "profile.py": profile,
    "utils.py":   utils,
}


@app.post("/reset")
def reset():
    """Restore the database and all route files to their pristine state."""
    # 1. Rebuild the database with seed data
    init_db()

    # 2. Overwrite live route files with the originals and reload each module
    for filename in ROUTE_FILES:
        src = os.path.join(ORIGINALS_DIR, filename)
        dst = os.path.join(ROUTES_DIR, filename)
        shutil.copy2(src, dst)

        # Reload the module so the running app serves the original (vulnerable)
        # code again, not a previously patched version that's still in memory.
        module = _ROUTE_MODULES[filename]
        importlib.reload(module)

        # Re-attach the freshly reloaded router so FastAPI picks up the routes
        router = module.router
        for route in router.routes:
            # Avoid duplicate routes: remove any existing route with the same path+methods
            app.routes[:] = [
                r for r in app.routes
                if not (hasattr(r, "path") and r.path == route.path
                        and hasattr(r, "methods") and r.methods == route.methods)
            ]
        app.include_router(router)

    return {"status": "reset complete", "restored_files": ROUTE_FILES}
