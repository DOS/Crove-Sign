#!/usr/bin/env bash

# ==============================================================================
# Crove Sign - Database Restore Script (Schema: sign)
# ==============================================================================
# Restores a compressed SQL dump file (.sql.gz) into PostgreSQL schema `sign`.
#
# Usage:
#   ./scripts/restore-sign-db.sh <path_to_backup_file.sql.gz> [/path/to/.env]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_FILE="${1:-}"
ENV_FILE="${2:-"${SCRIPT_DIR}/../.env"}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz> [/path/to/.env]"
  echo "Example: $0 /opt/crove/sign/backups/sign-backup-latest.sql.gz"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[ERROR] Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "/opt/crove/sign/.env" ]; then
    ENV_FILE="/opt/crove/sign/.env"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Environment file not found at: ${ENV_FILE}" >&2
  exit 1
fi

# Load DATABASE_URL from .env and clean Prisma-specific parameters for standard libpq
RAW_DB_URL=$(grep -E '^(NEXT_PRIVATE_DATABASE_URL|DATABASE_URL)=' "$ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r')

if [ -z "$RAW_DB_URL" ]; then
  echo "[ERROR] DATABASE_URL not found in ${ENV_FILE}" >&2
  exit 1
fi

CLEAN_DB_URL=$(echo "$RAW_DB_URL" | sed -E 's/sslmode=no-verify/sslmode=require/g; s/[?&]schema=[^&]*//g; s/postgres&/postgres?/; s/\?&/?/; s/\?$//')

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] This operation will restore schema 'sign' from: ${BACKUP_FILE}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] Decompressing and executing restore via psql..."

gunzip -c "$BACKUP_FILE" | docker run --rm -i \
  postgres:17-alpine \
  psql "$CLEAN_DB_URL" \
  --set ON_ERROR_STOP=on

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] Schema 'sign' has been restored successfully from ${BACKUP_FILE}!"
