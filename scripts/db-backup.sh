#!/usr/bin/env bash
set -euo pipefail

PGROOT="${PGROOT:-$HOME/pgsql}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/weitblick-backups}"
PGPORT="${PGPORT:-5433}"
PGDATABASE="${PGDATABASE:-weitblick}"
PGUSER="${PGUSER:-weitblick}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

stamp=$(date +%Y%m%d-%H%M%S)

if [ -n "${DATABASE_URL:-}" ]; then
  target="$BACKUP_DIR/weitblick-remote-$stamp.dump"
  echo "source: DATABASE_URL"

  "$PGROOT/bin/pg_dump.exe" -Fc -f "$target" "$DATABASE_URL"
else
  target="$BACKUP_DIR/weitblick-$stamp.dump"
  echo "source: local 127.0.0.1:$PGPORT/$PGDATABASE"

  export PGPASSWORD="${PGPASSWORD:-weitblick}"

  "$PGROOT/bin/pg_dump.exe" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" \
    -d "$PGDATABASE" -Fc -f "$target"
fi

size=$(du -m "$target" | cut -f1)
echo "backup written: $target (${size} MB)"

find "$BACKUP_DIR" -name 'weitblick-*.dump' ! -name 'weitblick-remote-*.dump' \
  -mtime "+$RETENTION_DAYS" -delete
echo "pruned local dumps older than $RETENTION_DAYS days (remote dumps are kept)"
