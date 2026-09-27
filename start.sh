#!/bin/sh
# Runs both processes in one container so they share the same filesystem.
# Sentinel patches target_app/routes/ files directly — this only works if
# both processes see the same disk.

uvicorn target_app.main:app --host 0.0.0.0 --port 8001 &
TARGET_APP_PID=$!

uvicorn sentinel.main:app --host 0.0.0.0 --port "${PORT:-8000}"

kill $TARGET_APP_PID
