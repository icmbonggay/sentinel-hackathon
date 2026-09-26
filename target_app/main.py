import importlib
import shutil
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from target_app.db import init_db
from target_app.routes import auth, profile, utils


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Sentinel Target App", lifespan=lifespan)

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

# Map bare module name -> module object (used by /internal/reload and reload_route)
_ROUTE_MODULES_BY_NAME = {
    "auth":    auth,
    "profile": profile,
    "utils":   utils,
}

# Tracks the APIRouter object currently registered for each module.
# After include_router(router), FastAPI appends a _IncludedRouter wrapper
# whose .original_router IS the APIRouter we passed in.  We use identity
# comparison against this stored value to find and remove the right wrapper
# when the module is reloaded.
_REGISTERED_ROUTERS: dict = {}


def _register_router(module_name: str) -> None:
    """
    Call include_router() for one module and record which APIRouter object
    was registered so reload_route() can find and replace it later.
    """
    router = _ROUTE_MODULES_BY_NAME[module_name].router
    app.include_router(router)
    # app.routes[-1] is the _IncludedRouter wrapper just added
    _REGISTERED_ROUTERS[module_name] = router


# Initial registration of all three route modules
_register_router("auth")
_register_router("profile")
_register_router("utils")


def reload_route(module_name: str) -> None:
    """
    Reload a single route module by its bare name (e.g. 'auth') and
    re-register its router with the running FastAPI app.

    Duplicate-route prevention: FastAPI wraps each include_router() call in a
    _IncludedRouter object stored in app.routes.  That wrapper exposes
    .original_router pointing to the APIRouter passed in.  We remove the
    wrapper whose .original_router IS the previously registered router, then
    add a fresh wrapper for the newly reloaded router.  This works regardless
    of how many routes the module declares.
    """
    module = _ROUTE_MODULES_BY_NAME[module_name]
    importlib.reload(module)

    old_router = _REGISTERED_ROUTERS.get(module_name)
    if old_router is not None:
        app.routes[:] = [
            r for r in app.routes
            if getattr(r, "original_router", None) is not old_router
        ]

    new_router = module.router
    app.include_router(new_router)
    _REGISTERED_ROUTERS[module_name] = new_router


@app.post("/internal/reload/{module_name}")
def internal_reload(module_name: str):
    """
    Explicitly reload a route module and re-register its router.
    Called by Sentinel immediately after copying a patch file so that the
    patched code is live before the TEST/RETEST steps begin.
    """
    if module_name not in _ROUTE_MODULES_BY_NAME:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown route module '{module_name}'. "
                   f"Valid names: {sorted(_ROUTE_MODULES_BY_NAME)}",
        )
    reload_route(module_name)
    return {"status": "reloaded", "module": module_name}


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

        # Reload via the shared helper (handles dedup + re-registration)
        module_name = filename.removesuffix(".py")
        reload_route(module_name)

    return {"status": "reset complete", "restored_files": ROUTE_FILES}
