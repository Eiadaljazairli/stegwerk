#!/usr/bin/env bash
set -euo pipefail

DATEI=${1:-}
ZIEL=${ZIEL:-/opt/stegwerk}
UMGEBUNG=${UMGEBUNG:-$ZIEL/.env.prod}
COMPOSE=${COMPOSE:-$ZIEL/docker-compose.prod.yml}

if [ -z "$DATEI" ]; then
  echo "Aufruf: $0 <sicherung.dump>" >&2
  echo >&2
  echo "Vorhanden:" >&2
  ls -lh /var/backups/stegwerk/stegwerk-*.dump 2>/dev/null >&2 || echo "  (keine)" >&2
  exit 1
fi

if [ ! -f "$DATEI" ]; then
  echo "Es gibt keine Datei $DATEI" >&2
  exit 1
fi

docker_compose() {
  docker compose --env-file "$UMGEBUNG" -f "$COMPOSE" "$@"
}

echo "Prüfe $DATEI"

if ! docker_compose exec -T postgres pg_restore --list > /dev/null < "$DATEI"; then
  echo "Diese Datei lässt sich nicht lesen. Abbruch, es wurde nichts angefasst." >&2
  exit 1
fi

cat <<EOF

  Zurückspielen von: $DATEI
  Stand:             $(date -r "$DATEI" '+%d.%m.%Y %H:%M')

  Der gesamte jetzige Datenbestand wird dabei ersetzt. Alles, was seit diesem
  Stand eingetragen wurde, ist danach weg.

EOF

read -rp 'Zum Bestätigen "zuruecksetzen" tippen: ' antwort

if [ "$antwort" != "zuruecksetzen" ]; then
  echo "Abgebrochen. Es wurde nichts angefasst."
  exit 1
fi

echo "Halte die Anwendung an"
docker_compose stop api web

echo "Spiele zurück"
ergebnis=0
docker_compose exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --single-transaction --no-owner' \
  < "$DATEI" || ergebnis=$?

echo "Starte die Anwendung"
docker_compose up -d

if [ "$ergebnis" -ne 0 ]; then
  echo >&2
  echo "pg_restore hat $ergebnis gemeldet. Die Meldungen oben lesen:" >&2
  echo "Hinweise auf nicht vorhandene Objekte sind beim --clean normal." >&2
  echo "Alles andere ist es nicht." >&2
fi

echo "Warte auf die Anwendung"
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 http://127.0.0.1:8080/health >/dev/null 2>&1; then
    echo "Antwortet."
    exit 0
  fi
  sleep 5
done

echo "Keine Antwort nach fünf Minuten. Protokoll:" >&2
docker_compose logs --tail 50 api >&2
exit 1
