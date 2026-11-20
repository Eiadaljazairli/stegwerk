#!/usr/bin/env bash
set -euo pipefail

ZIEL=${ZIEL:-/opt/stegwerk}
UMGEBUNG=${UMGEBUNG:-$ZIEL/.env.prod}
COMPOSE=${COMPOSE:-$ZIEL/docker-compose.prod.yml}
ABLAGE=${ABLAGE:-/var/backups/stegwerk}
STAND=${STAND:-/var/lib/stegwerk/stand}
TABELLEN=${TABELLEN:-"workspaces users memberships companies contacts deals invoices"}
PLATZ_RESERVE_MB=${PLATZ_RESERVE_MB:-2048}

docker_compose() {
  docker compose --env-file "$UMGEBUNG" -f "$COMPOSE" "$@"
}

mkdir -p "$STAND"
chmod 755 "$STAND"

beginn=$(date +%s)
name="stegwerk-probe-$$"

ergebnis() {
  printf '{"am":"%s","ok":%s,"meldung":"%s","datei":"%s","dauerSek":%s,"tabellen":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" "$4" "$5" \
    > "$STAND/sicherung-probe.json.teil"
  chmod 644 "$STAND/sicherung-probe.json.teil"
  mv "$STAND/sicherung-probe.json.teil" "$STAND/sicherung-probe.json"
}

scheitern() {
  echo "$1" >&2
  ergebnis false "$1" "$(basename "${datei:-}")" "$(($(date +%s) - beginn))" '[]'
  exit 1
}

aufraeumen() { docker rm -f "$name" > /dev/null 2>&1 || true; }
trap aufraeumen EXIT

datei=$(find "$ABLAGE" -name 'stegwerk-*.dump' -printf '%T@ %p\n' 2>/dev/null \
  | sort -n | tail -1 | cut -d' ' -f2-)

[ -n "$datei" ] || scheitern "Keine Sicherung unter $ABLAGE gefunden."

echo "Probe mit $datei"

betrieb=$(docker_compose ps -q postgres)
[ -n "$betrieb" ] || scheitern "Der Container postgres läuft nicht."
abbild=$(docker inspect --format '{{.Config.Image}}' "$betrieb") \
  || scheitern "Das Abbild des Containers postgres ließ sich nicht ermitteln."

wurzel=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null) \
  || scheitern "Das Docker-Verzeichnis ließ sich nicht ermitteln."
frei_kb=$(df -Pk "$wurzel" 2>/dev/null | awk 'NR == 2 { print $4 }')
case "$frei_kb" in
  '' | *[!0-9]*) scheitern "Der freie Platz unter $wurzel ließ sich nicht messen." ;;
esac
noetig_kb=$(( ($(stat -c %s "$datei") / 1024) * 3 + PLATZ_RESERVE_MB * 1024 ))
[ "$frei_kb" -ge "$noetig_kb" ] \
  || scheitern "Zu wenig Platz unter $wurzel für die Probe: frei $((frei_kb / 1024)) MB, nötig $((noetig_kb / 1024)) MB."

docker run -d --rm --name "$name" --network none \
  -e POSTGRES_PASSWORD=probe -e POSTGRES_DB=probe "$abbild" > /dev/null \
  || scheitern "Der Probe-Container ließ sich nicht starten."

bereit() {
  docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d probe > /dev/null 2>&1
}

for _ in $(seq 1 60); do
  if bereit; then
    break
  fi
  sleep 1
done

bereit || scheitern "Die Probe-Datenbank wurde nicht bereit."

einspielen_beginn=$(date +%s)

docker exec -i "$name" pg_restore -U postgres -d probe --no-owner \
  --no-privileges --exit-on-error < "$datei" \
  || scheitern "Die Sicherung ließ sich nicht vollständig einspielen."

dauer=$(($(date +%s) - einspielen_beginn))

zaehle_probe() {
  docker exec "$name" psql -U postgres -d probe -At -c "SELECT count(*) FROM \"$1\""
}

zaehle_betrieb() {
  docker_compose exec -T postgres \
    sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -c 'SELECT count(*) FROM \"$1\"'"
}

ok=true
meldung="Zurückgespielt und verglichen."
tabellen="["
trenner=""

for tabelle in $TABELLEN; do
  probe=$(zaehle_probe "$tabelle" 2>/dev/null) \
    || scheitern "Die Tabelle $tabelle fehlt in der Sicherung."
  jetzt=$(zaehle_betrieb "$tabelle" 2>/dev/null | tr -d '\r') \
    || scheitern "Die Tabelle $tabelle ließ sich im Betrieb nicht zählen."
  for zahl in "$probe" "$jetzt"; do
    case "$zahl" in
      '' | *[!0-9]*) scheitern "Die Zählung von $tabelle lieferte keine Zahl." ;;
    esac
  done

  if { [ "$probe" -eq 0 ] && [ "$jetzt" -gt 0 ]; } || [ "$probe" -gt $((jetzt * 2 + 10)) ]; then
    ok=false
    meldung="Die Zeilenzahl von $tabelle passt nicht zum Betrieb."
  fi

  tabellen="$tabellen$trenner{\"name\":\"$tabelle\",\"sicherung\":$probe,\"betrieb\":$jetzt}"
  trenner=","
  echo "  $tabelle: Sicherung $probe, Betrieb $jetzt"
done

tabellen="$tabellen]"

ergebnis "$ok" "$meldung" "$(basename "$datei")" "$dauer" "$tabellen"
echo "$meldung Dauer des Einspielens: ${dauer}s"

[ "$ok" = true ]
