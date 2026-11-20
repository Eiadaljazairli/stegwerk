#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ZIEL=.env.prod
ORIGIN="${1:-http://localhost:8080}"

if [ -f "$ZIEL" ]; then
  echo "$ZIEL exists already, nothing to do."
  exit 0
fi

command -v openssl >/dev/null || { echo "openssl is required."; exit 1; }

zufall_hex() { openssl rand -hex "$1"; }
zufall_b64() { openssl rand -base64 32; }

setzen() {
  local name="$1" wert="$2"
  python3 - "$ZIEL" "$name" "$wert" <<'PY' 2>/dev/null || sed -i "s|^$name=.*|$name=$wert|" "$ZIEL"
import sys, re
pfad, name, wert = sys.argv[1:4]
text = open(pfad).read()
text = re.sub(rf'^{name}=.*$', lambda _: f'{name}={wert}', text, flags=re.M)
open(pfad, 'w').write(text)
PY
}

cp .env.prod.example "$ZIEL"
chmod 600 "$ZIEL"

setzen POSTGRES_PASSWORD "$(zufall_hex 24)"
setzen JWT_SECRET "$(zufall_hex 48)"
setzen MAIL_ENCRYPTION_KEY "$(zufall_b64)"
setzen TOTP_ENCRYPTION_KEY "$(zufall_b64)"
setzen WEB_ORIGIN "$ORIGIN"

cat <<EOF
Created $ZIEL with fresh secrets (WEB_ORIGIN=$ORIGIN).

Start Stegwerk:

  docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

Then open $ORIGIN and create the first account.
Optional settings (SMTP, sign-in with Google/Microsoft, legal notice) are
described in .env.prod.
EOF
