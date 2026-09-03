#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Crove Sign & Gotenberg Watchdog & Health Alerting Script
# ==============================================================================

SIGN_DIR="/opt/crove/sign"
STATE_FILE="/tmp/crove_sign_health.state"
LOG_FILE="/var/log/crove-sign-health.log"
SIGN_HEALTH_URL="http://127.0.0.1:4008/api/health"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date -u +'%Y-%m-%d %H:%M:%S UTC')] $1" | tee -a "$LOG_FILE"
}

# 1. Check crove-sign container status
SIGN_STATUS=$(docker inspect --format='{{.State.Status}} ({{.State.Health.Status}})' crove-sign 2>/dev/null || echo "not_found")
GOTENBERG_STATUS=$(docker inspect --format='{{.State.Status}} ({{.State.Health.Status}})' crove-gotenberg 2>/dev/null || echo "not_found")

# 2. Check HTTP health endpoint
HTTP_CODE=$(curl -s -o /tmp/sign_health.json -w "%{http_code}" --max-time 10 "$SIGN_HEALTH_URL" 2>/dev/null || echo "000")

SIGN_OK=false
if [ "$HTTP_CODE" = "200" ]; then
  if grep -q '"database":{"status":"ok"}' /tmp/sign_health.json 2>/dev/null; then
    SIGN_OK=true
  fi
fi

rm -f /tmp/sign_health.json

# 3. Handle Health Status
if [ "$SIGN_OK" = true ] && [[ "$GOTENBERG_STATUS" == *"healthy"* || "$GOTENBERG_STATUS" == *"running"* ]]; then
  # Reset failure count
  if [ -f "$STATE_FILE" ]; then
    PREV_FAILURES=$(cat "$STATE_FILE")
    if [ "$PREV_FAILURES" -gt 0 ]; then
      log "RECOVERY: Crove Sign & Gotenberg have recovered. Status: crove-sign=$SIGN_STATUS, gotenberg=$GOTENBERG_STATUS, http=$HTTP_CODE."
    fi
  fi
  echo "0" > "$STATE_FILE"
  exit 0
else
  # Increment failure counter
  FAILURES=1
  if [ -f "$STATE_FILE" ]; then
    PREV=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
    FAILURES=$((PREV + 1))
  fi
  echo "$FAILURES" > "$STATE_FILE"

  log "WARNING: Health check failed (consecutive failures: $FAILURES). crove-sign=$SIGN_STATUS, gotenberg=$GOTENBERG_STATUS, http=$HTTP_CODE."

  # Self-heal on 2 consecutive failures
  if [ "$FAILURES" -ge 2 ]; then
    log "ACTION: Triggering auto-restart of crove-sign and crove-gotenberg containers..."
    cd "$SIGN_DIR"
    docker compose up -d --force-recreate >> "$LOG_FILE" 2>&1 || docker restart crove-sign crove-gotenberg >> "$LOG_FILE" 2>&1
    log "ACTION: Containers restarted. Resetting failure counter to 1."
    echo "1" > "$STATE_FILE"
  fi

  exit 1
fi
