#!/usr/bin/env bash

# ==============================================================================
# Crove Sign - Automated Database Backup Script (Schema: sign)
# ==============================================================================
# Performs an isolated, compressed dump of PostgreSQL schema `sign` on Supabase.
# Automatically prunes backups older than RETENTION_DAYS (default: 30 days).
#
# Usage:
#   ./scripts/backup-sign-db.sh [/path/to/sign/.env]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-"${SCRIPT_DIR}/../.env"}"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "/opt/crove/sign/.env" ]; then
    ENV_FILE="/opt/crove/sign/.env"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Environment file not found at: ${ENV_FILE}" >&2
  exit 1
fi

# Load DATABASE_URL from .env and clean Prisma-specific parameters for standard libpq
RAW_DB_URL=$(grep -E '^(NEXT_PRIVATE_DATABASE_URL|DATABASE_URL)=' "$ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r')

if [ -z "$RAW_DB_URL" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] DATABASE_URL not found in ${ENV_FILE}" >&2
  exit 1
fi

# Clean ?schema=sign and replace Prisma's sslmode=no-verify with libpq standard sslmode=require
CLEAN_DB_URL=$(echo "$RAW_DB_URL" | sed -E 's/sslmode=no-verify/sslmode=require/g; s/[?&]schema=[^&]*//g; s/postgres&/postgres?/; s/\?&/?/; s/\?$//')

BACKUP_DIR="${BACKUP_DIR:-"/opt/crove/sign/backups"}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/sign-backup-${TIMESTAMP}.sql.gz"
LATEST_LINK="${BACKUP_DIR}/sign-backup-latest.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Starting backup of Crove Sign database (schema: sign)..."

# Run pg_dump via postgres:17-alpine docker container with schema isolation
docker run --rm -i \
  postgres:17-alpine \
  pg_dump "$CLEAN_DB_URL" \
  --schema=sign \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | gzip -9 > "$BACKUP_FILE"

FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Backup created successfully: ${BACKUP_FILE} (${FILESIZE})"

# Update latest symlink
ln -sf "$BACKUP_FILE" "$LATEST_LINK"

# Retention policy: remove backups older than RETENTION_DAYS
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "sign-backup-*.sql.gz" -type f -mtime +"${RETENTION_DAYS}" -delete

TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "sign-backup-*.sql.gz" -type f | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Total backup snapshots currently stored: ${TOTAL_BACKUPS}"
