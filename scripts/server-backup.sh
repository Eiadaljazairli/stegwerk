#!/usr/bin/env bash
set -euo pipefail

ZIEL=${ZIEL:-/opt/stegwerk}
UMGEBUNG=${UMGEBUNG:-$ZIEL/.env.prod}
COMPOSE=${COMPOSE:-$ZIEL/docker-compose.prod.yml}
ABLAGE=${ABLAGE:-/var/backups/stegwerk}
TAGE=${TAGE:-14}
STAND=${STAND:-/var/lib/stegwerk/stand}

mkdir -p "$STAND"
chmod 755 "$STAND"

stand_schreiben() {
  local datei="$STAND/$1"

  printf '%s\n' "$2" > "$datei.teil"
  chmod 644 "$datei.teil"
  mv "$datei.teil" "$datei"
}

fehler_melden() {
  stand_schreiben sicherung-fehler.json \
    "{\"am\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"meldung\":\"$1\"}"
}

if [ ! -f "$UMGEBUNG" ]; then
  echo "Keine Einstellungsdatei unter $UMGEBUNG — läuft dieses Skript auf dem richtigen Rechner?" >&2
  exit 1
fi

docker_compose() {
  docker compose --env-file "$UMGEBUNG" -f "$COMPOSE" "$@"
}

if ! docker_compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  echo "Der Container postgres läuft nicht. Nichts zu sichern." >&2
  fehler_melden "Der Container postgres lief nicht."
  exit 1
fi

mkdir -p "$ABLAGE"
chmod 700 "$ABLAGE"

stempel=$(date +%Y%m%d-%H%M%S)
fertig="$ABLAGE/stegwerk-$stempel.dump"
teil="$fertig.teil"

aufraeumen() { rm -f "$teil"; }
trap aufraeumen EXIT
trap 'fehler_melden "Die Sicherung brach ab (siehe journalctl -u stegwerk-sicherung)."' ERR

echo "Sichere nach $fertig"

docker_compose exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$teil"

if [ ! -s "$teil" ]; then
  echo "Die Sicherung ist leer. Abbruch." >&2
  fehler_melden "Die Sicherung war leer."
  exit 1
fi

if ! docker_compose exec -T postgres pg_restore --list > /dev/null < "$teil"; then
  echo "Die Sicherung lässt sich nicht lesen. Abbruch." >&2
  fehler_melden "Die Sicherung ließ sich mit pg_restore --list nicht lesen."
  exit 1
fi

chmod 600 "$teil"
mv "$teil" "$fertig"
trap - EXIT

groesse=$(du -h "$fertig" | cut -f1)
echo "Geschrieben: $fertig ($groesse)"

entfernt=$(find "$ABLAGE" -name 'stegwerk-*.dump' -mtime "+$TAGE" -print -delete | wc -l)
echo "Älter als $TAGE Tage entfernt: $entfernt"

anzahl=$(find "$ABLAGE" -name 'stegwerk-*.dump' | wc -l)
echo "Vorhanden: $anzahl Sicherungen, zusammen $(du -sh "$ABLAGE" | cut -f1)"

sicherung_stand() {
  stand_schreiben sicherung-stand.json "{\"am\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"datei\":\"$(basename "$fertig")\",\"groesseBytes\":$(stat -c %s "$fertig"),\"geprueft\":true,\"anzahl\":$anzahl,\"ausserHaus\":\"$1\",\"kopien\":$2}"
}

sicherung_stand aus 0
rm -f "$STAND/sicherung-fehler.json"
trap - ERR

einstellung() { sed -n "s/^$1=//p" "$UMGEBUNG" | tail -1; }

EMPFAENGER=$(einstellung SICHERUNG_EMPFAENGER)
AUSSER_ZIEL=$(einstellung SICHERUNG_ZIEL)
AUSSER_PORT=$(einstellung SICHERUNG_PORT)
SSH_SCHLUESSEL=/root/.ssh/stegwerk_sicherung
ABHOLEN=/home/sicherung/stegwerk
BEHALTEN=${BEHALTEN:-30}

if [ -z "$EMPFAENGER" ]; then
  echo "Außer Haus: nicht eingerichtet (scripts/sicherung-einrichten.sh)."
  exit 0
fi

name="stegwerk-$stempel.tar.age"
arbeit=$(mktemp -d)
paket="$arbeit/$name"
trap 'rm -rf "$arbeit"' EXIT

cp "$fertig" "$arbeit/datenbank.dump"
cp "$UMGEBUNG" "$arbeit/env.prod"
tar -C "$arbeit" -cf - datenbank.dump env.prod | age -r "$EMPFAENGER" -o "$paket"

if [ -d "$ABHOLEN" ]; then
  install -m 0640 -o root -g sicherung "$paket" "$ABHOLEN/$name.teil"
  mv "$ABHOLEN/$name.teil" "$ABHOLEN/$name"
  find "$ABHOLEN" -name 'stegwerk-*.tar.age' | sort | head -n "-$BEHALTEN" | xargs -r rm -f
  kopien=$(find "$ABHOLEN" -name 'stegwerk-*.tar.age' | wc -l)
  echo "Zum Abholen bereit: $ABHOLEN/$name ($kopien vorhanden)"
  sicherung_stand abholen "$kopien"
fi

if [ -n "$AUSSER_ZIEL" ]; then
  ssh_ziel() {
    ssh -i "$SSH_SCHLUESSEL" -p "${AUSSER_PORT:-22}" -o BatchMode=yes \
      -o ConnectTimeout=30 "$AUSSER_ZIEL" "$@"
  }

  scp -q -i "$SSH_SCHLUESSEL" -P "${AUSSER_PORT:-22}" -o BatchMode=yes \
    -o ConnectTimeout=30 "$paket" "$AUSSER_ZIEL:stegwerk-sicherungen/$name.teil"

  ssh_ziel "cd stegwerk-sicherungen && mv '$name.teil' '$name' && ls -1 stegwerk-*.tar.age | sort | head -n -$BEHALTEN | xargs -r rm -f && ls -1 stegwerk-*.tar.age | wc -l" \
    | { read -r dort; echo "Hochgeladen: $name, dort $dort Sicherungen."; sicherung_stand hochladen "$dort"; }
fi
