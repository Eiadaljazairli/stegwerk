#!/usr/bin/env bash

set -euo pipefail

DOMAIN=""

BRANCH="master"

ADMIN_EMAIL=""

ZIEL=/opt/stegwerk
UMGEBUNG="$ZIEL/.env.prod"
SCHLUESSEL=/root/.ssh/stegwerk_deploy
REPO="${REPO:-$(git -C "$ZIEL" remote get-url origin 2>/dev/null || true)}"
if [ -z "$REPO" ]; then
  echo "REPO setzen, z. B.: REPO=https://github.com/<besitzer>/<repo>.git bash $0"
  exit 1
fi

sagen() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Als root ausfuehren."; exit 1; }

sagen "System aktualisieren und Docker einrichten"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl ufw nginx openssh-client \
  fail2ban unattended-upgrades age >/dev/null

systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
systemctl enable --now fail2ban >/dev/null 2>&1 || true

if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin >/dev/null
fi

systemctl enable --now docker >/dev/null 2>&1 || true

GERAEUMT=/root/.stegwerk-geraeumt

if [ -f "$UMGEBUNG" ] || docker volume ls -q 2>/dev/null | grep -q '^stegwerk_pgdata$'; then
  touch "$GERAEUMT"
fi

if [ ! -f "$GERAEUMT" ]; then
  sagen "Die alte Anwendung entfernen"

  echo "  Es werden alle vorhandenen Container, Abbilder und Volumes geloescht."
  echo "  Abbrechen mit Strg+C — es bleiben 10 Sekunden."
  sleep 10

  if command -v docker >/dev/null; then
    docker ps -aq | xargs -r docker rm -f
    docker volume ls -q | xargs -r docker volume rm -f
    docker system prune -af --volumes >/dev/null 2>&1 || true
  fi

  for dienst in apache2 caddy httpd; do
    systemctl disable --now "$dienst" >/dev/null 2>&1 || true
  done

  touch "$GERAEUMT"
fi

sagen "Firewall setzen"

ufw limit OpenSSH >/dev/null
ufw delete allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

if [[ "$REPO" == git@* ]]; then

mkdir -p /root/.ssh
chmod 700 /root/.ssh

if [ ! -f "$SCHLUESSEL" ]; then
  sagen "Bereitstellungsschluessel erzeugen"
  ssh-keygen -t ed25519 -N '' -C 'stegwerk-deploy' -f "$SCHLUESSEL" >/dev/null
fi

cat > /root/.ssh/config <<EOF
Host github.com
  IdentityFile $SCHLUESSEL
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 /root/.ssh/config

github_nimmt_uns() {
  local antwort
  antwort=$(ssh -o BatchMode=yes -T git@github.com 2>&1 || true)

  case "$antwort" in
    *'successfully authenticated'*) return 0 ;;
    *) return 1 ;;
  esac
}

if ! github_nimmt_uns; then
  cat <<EOF

  ──────────────────────────────────────────────────────────────────────
  Diesen Schluessel bei GitHub eintragen:

    In den Einstellungen des Repositorys unter "Deploy keys" -> "Add deploy key"

  Titel: vps          "Allow write access": NICHT ankreuzen

$(cat "$SCHLUESSEL.pub")

  Danach passiert alles Weitere von allein — dieses Fenster offen lassen.
  ──────────────────────────────────────────────────────────────────────

EOF

  erkannt=nein

  for versuch in $(seq 1 180); do
    sleep 10

    if github_nimmt_uns; then
      echo "Schluessel erkannt. Weiter."
      erkannt=ja
      break
    fi

    if [ $((versuch % 6)) -eq 0 ]; then
      echo "  … warte weiter ($((versuch / 6)) min)"
    fi
  done

  if [ "$erkannt" = nein ]; then
    echo "Nach 30 Minuten kein Schluessel. Skript erneut starten."
    exit 1
  fi
fi
fi

sagen "Quelltext holen ($BRANCH)"

if [ -d "$ZIEL/.git" ]; then
  git -C "$ZIEL" fetch --depth 1 origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
  git -C "$ZIEL" checkout -B "$BRANCH" "origin/$BRANCH"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$ZIEL"
fi

if [ ! -f "$UMGEBUNG" ]; then
  sagen "Geheimnisse erzeugen"

  if [ -n "$DOMAIN" ]; then URSPRUNG="https://$DOMAIN"; else
    URSPRUNG="http://$(curl -fsS --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')"
  fi

  cat > "$UMGEBUNG" <<EOF
POSTGRES_USER=stegwerk
POSTGRES_PASSWORD=$(openssl rand -hex 32)
POSTGRES_DB=stegwerk

JWT_SECRET=$(openssl rand -base64 48)
MAIL_ENCRYPTION_KEY=$(openssl rand -base64 32)
TOTP_ENCRYPTION_KEY=$(openssl rand -base64 32)

WEB_ORIGIN=$URSPRUNG

WEB_PORT=127.0.0.1:8080

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
MAIL_FROM_NAME=Stegwerk

LEGAL_COMPANY_NAME=
LEGAL_FORM=
LEGAL_STREET=
LEGAL_POSTAL_CODE=
LEGAL_CITY=
LEGAL_COUNTRY=Deutschland
LEGAL_EMAIL=
EOF
  chmod 600 "$UMGEBUNG"
fi

if ! grep -q '^TOTP_ENCRYPTION_KEY=.' "$UMGEBUNG"; then
  sagen "Schluessel fuer die Zwei-Faktor-Anmeldung erzeugen"
  sed -i '/^TOTP_ENCRYPTION_KEY=/d' "$UMGEBUNG"
  printf '\nTOTP_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" >> "$UMGEBUNG"
fi

if [ -z "$DOMAIN" ] && [ -f "$UMGEBUNG" ]; then
  URSPRUNG=$(sed -n 's/^WEB_ORIGIN=//p' "$UMGEBUNG" | tail -1)

  case "$URSPRUNG" in
    https://*)
      DOMAIN=${URSPRUNG#https://}
      DOMAIN=${DOMAIN%%/*}
      ;;
  esac
fi

if [ -z "$ADMIN_EMAIL" ] && [ -f "$UMGEBUNG" ]; then
  ADMIN_EMAIL=$(sed -n 's/^MAIL_FROM=//p' "$UMGEBUNG" | tail -1)
fi

if [ -n "$DOMAIN" ]; then
  sagen "Adresse laut Einstellungen: $DOMAIN"
fi

sagen "Abbilder bauen und starten"

cd "$ZIEL"
APP_VERSION="$(git rev-parse --short HEAD 2>/dev/null || echo unbekannt)-$(date -u +%Y%m%d%H%M)"
export APP_VERSION
docker compose --env-file "$UMGEBUNG" -f docker-compose.prod.yml build --pull

if [ -x /usr/local/bin/stegwerk-sichern ] &&
  [ -n "$(docker compose --env-file "$UMGEBUNG" -f docker-compose.prod.yml ps -q --status running postgres 2>/dev/null)" ]; then
  sagen "Sicherung vor dem Ausrollen"
  /usr/local/bin/stegwerk-sichern | tail -2 ||
    { echo "  Sicherung fehlgeschlagen — die alte Fassung laeuft weiter."; exit 1; }
fi

docker compose --env-file "$UMGEBUNG" -f docker-compose.prod.yml up -d

sagen "nginx einrichten"

{
  grep -qE '^[[:space:]]*server_tokens' /etc/nginx/nginx.conf || echo 'server_tokens off;'
  echo 'limit_req_zone $binary_remote_addr zone=stegwerk:10m rate=20r/s;'
  echo 'limit_req_status 429;'
} > /etc/nginx/conf.d/stegwerk-grenzen.conf

cat > /etc/nginx/sites-available/stegwerk <<EOF
server {
  listen 80;
  server_name ${DOMAIN:-_}${DOMAIN:+ www.$DOMAIN};

  client_max_body_size 50m;

  location / {
    limit_req zone=stegwerk burst=60 nodelay;
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

ln -sf /etc/nginx/sites-available/stegwerk /etc/nginx/sites-enabled/stegwerk
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if [ -n "$DOMAIN" ]; then
  sagen "Zertifikat holen fuer $DOMAIN"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null

  if [ -n "$ADMIN_EMAIL" ]; then
    ANMELDUNG=(-m "$ADMIN_EMAIL")
  else
    ANMELDUNG=(--register-unsafely-without-email)
  fi

  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --expand --non-interactive \
    --agree-tos "${ANMELDUNG[@]}" --redirect ||
    certbot --nginx -d "$DOMAIN" --non-interactive \
      --agree-tos "${ANMELDUNG[@]}" --redirect
fi

sagen "Taegliche Sicherung einrichten"

install -m 0755 "$ZIEL/scripts/server-backup.sh" /usr/local/bin/stegwerk-sichern
install -m 0755 "$ZIEL/scripts/server-restore.sh" /usr/local/bin/stegwerk-zurueckspielen
install -m 0755 "$ZIEL/scripts/sicherung-probe.sh" /usr/local/bin/stegwerk-probe
install -d -m 0755 /var/lib/stegwerk/stand

cat > /etc/systemd/system/stegwerk-sicherung.service <<EOF
[Unit]
Description=Stegwerk: Datenbank sichern
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/stegwerk-sichern
EOF

cat > /etc/systemd/system/stegwerk-sicherung.timer <<EOF
[Unit]
Description=Stegwerk: jede Nacht sichern

[Timer]
OnCalendar=*-*-* 03:20:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/stegwerk-probe.service <<EOF
[Unit]
Description=Stegwerk: Wiederherstellungstest der letzten Sicherung
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/stegwerk-probe
EOF

cat > /etc/systemd/system/stegwerk-probe.timer <<EOF
[Unit]
Description=Stegwerk: woechentlich die Sicherung probeweise zurueckspielen

[Timer]
OnCalendar=Sun *-*-* 04:30:00
Persistent=true
RandomizedDelaySec=600

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now stegwerk-sicherung.timer >/dev/null
systemctl enable --now stegwerk-probe.timer >/dev/null

if systemctl start stegwerk-sicherung; then
  echo "Erste Sicherung:"
  ls -lh /var/backups/stegwerk/ 2>/dev/null | tail -3
else
  echo "Die erste Sicherung ist gescheitert. Protokoll:"
  journalctl -u stegwerk-sicherung -n 20 --no-pager
fi

sagen "Gesundheitspruefung"

for i in $(seq 1 60); do
  if curl -fsS --max-time 5 http://127.0.0.1:8080/health >/dev/null 2>&1; then
    echo "Antwortet."
    break
  fi
  [ "$i" -eq 60 ] && {
    echo "Keine Antwort nach 60 Versuchen. Protokoll:"
    docker compose --env-file "$UMGEBUNG" -f docker-compose.prod.yml logs --tail 50 api
    exit 1
  }
  sleep 5
done

sagen "Fertig"

if [ -n "$DOMAIN" ]; then
  ADRESSE="https://$DOMAIN"
else
  ADRESSE="http://$(hostname -I | awk '{print $1}')"
fi

cat <<EOF

  Erreichbar unter: $ADRESSE

  Einstellungen:  $UMGEBUNG
  Protokoll:      cd $ZIEL && docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api
  Neu ausrollen:  dieses Skript noch einmal starten

  Sicherungen:    /var/backups/stegwerk/ — jede Nacht um 03:20
  Von Hand:       systemctl start stegwerk-sicherung
  Nachsehen:      systemctl list-timers stegwerk-sicherung
  Probe:          systemctl start stegwerk-probe (sonst sonntags 04:30)
  Zurueckspielen: stegwerk-zurueckspielen <datei.dump>

EOF

if [ -z "$(sed -n 's/^SMTP_HOST=//p' "$UMGEBUNG" | tail -1)" ]; then
  cat <<EOF
  Offen, solange SMTP_HOST leer ist: niemand kann seine Adresse bestaetigen,
  und damit nimmt niemand eine Einladung an. Die Zugangsdaten in
  $UMGEBUNG eintragen und das Skript noch einmal laufen lassen.

EOF
fi
