#!/usr/bin/env bash
set -euo pipefail

PGROOT="${PGROOT:-$HOME/pgsql}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-weitblick}"

export PGPASSWORD="${PGPASSWORD:-weitblick}"

dump="${1:-}"
target="${2:-weitblick_restore_check}"

if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "usage: $0 <dump-file> [target-database]" >&2
  exit 1
fi

if [ "$target" = "stegwerk" ]; then
  echo "Refusing to restore over the live database without an explicit force." >&2
  echo "Restore into a scratch database and swap, or set the name by hand." >&2
  exit 1
fi

psql() { "$PGROOT/bin/psql.exe" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" "$@"; }

psql -d postgres -c "DROP DATABASE IF EXISTS \"$target\";" >/dev/null
psql -d postgres -c "CREATE DATABASE \"$target\";" >/dev/null

"$PGROOT/bin/pg_restore.exe" -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" \
  -d "$target" --no-owner --no-privileges "$dump" >/dev/null 2>&1 || true

echo "restored into database: $target"
psql -d "$target" -tAc \
  "SELECT '  ' || tablename || ': ' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) c FROM ' || quote_ident(tablename), false, true, '')))[1]::text || ' rows'
   FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
