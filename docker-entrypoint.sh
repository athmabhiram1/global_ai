#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${BIFROST_APP_DIR:-/data/bifrost}"
mkdir -p "$APP_DIR" /data

# Seed the config on first run so an operator can mount /data and edit it.
if [ ! -f "$APP_DIR/config.json" ]; then
  cp /app/config/bifrost.json "$APP_DIR/config.json"
  echo "[entrypoint] seeded $APP_DIR/config.json"
fi

echo "[entrypoint] starting bifrost-http on 0.0.0.0:8080"
bifrost-http -app-dir "$APP_DIR" -host 0.0.0.0 -port 8080 -log-level "${BIFROST_LOG_LEVEL:-info}" &
BIFROST_PID=$!

echo "[entrypoint] starting mock-provider on :8099"
mock-provider -addr :8099 &
MOCK_PID=$!

echo "[entrypoint] starting cc-sidecar on :8090"
cc-sidecar -addr :8090 &
SIDECAR_PID=$!

shutdown() {
  kill -TERM "$BIFROST_PID" "$SIDECAR_PID" "$MOCK_PID" 2>/dev/null || true
}
trap shutdown TERM INT

# Exit when either process dies, then take the other one down with us.
set +e
wait -n
STATUS=$?
set -e
shutdown
wait 2>/dev/null || true
echo "[entrypoint] exiting with status $STATUS"
exit "$STATUS"
