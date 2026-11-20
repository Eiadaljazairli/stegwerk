#!/usr/bin/env bash
set -euo pipefail

ZIEL=${ZIEL:-/opt/stegwerk}
UMGEBUNG=${UMGEBUNG:-$ZIEL/.env.prod}
ABHOLEN=/home/sicherung/stegwerk

[ "$(id -u)" -eq 0 ] || { echo "Als root ausfuehren."; exit 1; }
[ -f "$UMGEBUNG" ] || { echo "Keine $UMGEBUNG — erst ausrollen."; exit 1; }

sagen() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }

setze() {
  sed -i "/^$1=/d" "$UMGEBUNG"
  printf '%s=%s\n' "$1" "$2" >> "$UMGEBUNG"
  chmod 600 "$UMGEBUNG"
}

schluesselpaar() {
  command -v age >/dev/null || apt-get install -y -qq age >/dev/null

  if grep -q '^SICHERUNG_EMPFAENGER=age1' "$UMGEBUNG"; then
    echo "  Verschluesselung ist schon eingerichtet; der Schluessel bleibt."
    return
  fi

  local ordner geheim
  ordner=$(mktemp -d)
  chmod 700 "$ordner"
  geheim="$ordner/schluessel.txt"
  age-keygen -o "$geheim"

  echo
  echo "  ┌──────────────────────────────────────────────────────────────────┐"
  echo "  │ GEHEIMER SCHLUESSEL — jetzt sicher aufbewahren                   │"
  echo "  │ (Passwortmanager oder ausgedruckt im Schrank).                   │"
  echo "  │ Er wird nur dieses eine Mal angezeigt und danach geloescht.      │"
  echo "  │ Ohne ihn laesst sich keine Sicherung mehr oeffnen.               │"
  echo "  └──────────────────────────────────────────────────────────────────┘"
  echo
  grep '^AGE-SECRET-KEY-' "$geheim"
  echo
  read -r -p "  Aufbewahrt? Dann Enter druecken. " _

  setze SICHERUNG_EMPFAENGER "$(age-keygen -y "$geheim")"
  shred -u "$geheim" 2>/dev/null || rm -f "$geheim"
  rmdir "$ordner"
}

erste_sicherung() {
  sagen "Erste verschluesselte Sicherung"
  install -m 0755 "$ZIEL/scripts/server-backup.sh" /usr/local/bin/stegwerk-sichern
  /usr/local/bin/stegwerk-sichern | tail -2
}

abholen_einrichten() {
  sagen "Verschluesselung"
  schluesselpaar

  sagen "Benutzer zum Abholen"
  id sicherung >/dev/null 2>&1 ||
    useradd --create-home --shell /usr/sbin/nologin sicherung
  passwd -l sicherung >/dev/null

  chown root:root /home/sicherung
  chmod 755 /home/sicherung
  install -d -m 0750 -o root -g sicherung "$ABHOLEN"
  install -d -m 0755 -o root -g root /home/sicherung/.ssh

  local datei=/etc/ssh/sshd_config
  local anfang='# >>> stegwerk-sicherung'
  local ende='# <<< stegwerk-sicherung'

  sed -i "/^$anfang\$/,/^$ende\$/d" "$datei"
  [ -z "$(tail -c1 "$datei")" ] || echo >> "$datei"
  cat >> "$datei" <<EOF
$anfang
Match User sicherung
  ForceCommand internal-sftp -R
  PasswordAuthentication no
  AllowTcpForwarding no
  AllowAgentForwarding no
  X11Forwarding no
  PermitTTY no
$ende
EOF

  if ! sshd -t; then
    sed -i "/^$anfang\$/,/^$ende\$/d" "$datei"
    echo "  Die SSH-Einstellung wurde nicht angenommen und wieder entfernt."
    exit 1
  fi
  systemctl reload ssh 2>/dev/null || systemctl reload sshd

  erste_sicherung

  local host
  host=$(sed -n 's#^WEB_ORIGIN=https\?://##p' "$UMGEBUNG" | tail -1)
  host=${host%%/*}

  sagen "Jetzt auf dem Rechner im Buero"
  cat <<EOF

  1. Start-Menue → "PowerShell" eintippen → Windows PowerShell oeffnen.
  2. Alles zwischen den Strichen kopieren, einfuegen, Enter:

---------------------------------------------------------------------------
\$ordner = Join-Path \$env:USERPROFILE 'Stegwerk'
New-Item -ItemType Directory -Force \$ordner, (Join-Path \$env:USERPROFILE '.ssh') | Out-Null
\$schluessel = Join-Path \$env:USERPROFILE '.ssh\\stegwerk_sicherung'
if (-not (Test-Path \$schluessel)) { cmd /c "ssh-keygen -t ed25519 -q -N """" -C stegwerk-buero -f ""\$schluessel""" }
@'
\$ziel = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Stegwerk-Sicherungen'
New-Item -ItemType Directory -Force \$ziel | Out-Null
\$befehle = Join-Path \$env:TEMP 'stegwerk-sftp.txt'
"lcd \`"\$ziel\`"\`nget stegwerk/*.tar.age\`n" | Set-Content -Encoding ASCII \$befehle
\$aus = & sftp -b \$befehle -i (Join-Path \$env:USERPROFILE '.ssh\\stegwerk_sicherung') -o StrictHostKeyChecking=accept-new -o BatchMode=yes sicherung@${host} 2>&1
"\$(Get-Date -Format s) \$(\$aus -join ' | ')" | Add-Content (Join-Path \$ziel 'protokoll.txt')
Get-ChildItem \$ziel -Filter 'stegwerk-*.tar.age' | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item
'@ | Set-Content -Encoding UTF8 (Join-Path \$ordner 'sicherung-holen.ps1')
\$aktion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \`"\$ordner\\sicherung-holen.ps1\`""
\$wann = New-ScheduledTaskTrigger -Daily -At 9am
Register-ScheduledTask -TaskName 'Stegwerk-Sicherung' -Action \$aktion -Trigger \$wann -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -Force | Out-Null
Write-Host ''; Write-Host 'Diese Zeile auf dem Server ausfuehren:' -ForegroundColor Yellow
Write-Host ("bash scripts/sicherung-einrichten.sh freigeben '" + (Get-Content "\$schluessel.pub") + "'")
---------------------------------------------------------------------------

  3. Die gelbe Zeile, die PowerShell danach zeigt, hier auf dem Server
     in /opt/stegwerk ausfuehren.
  4. Zum Pruefen in PowerShell:  Start-ScheduledTask Stegwerk-Sicherung
     Auf dem Desktop erscheint der Ordner Stegwerk-Sicherungen.

EOF
}

freigeben() {
  local schluessel=${1:-}

  case "$schluessel" in
    ssh-ed25519\ *|ssh-rsa\ *|ecdsa-*) ;;
    *) echo "Das ist kein oeffentlicher SSH-Schluessel."; exit 1 ;;
  esac

  [ -d /home/sicherung/.ssh ] || { echo "Erst ohne Zusatz einrichten: bash $0"; exit 1; }

  printf 'restrict %s\n' "$schluessel" >> /home/sicherung/.ssh/authorized_keys
  sort -u -o /home/sicherung/.ssh/authorized_keys /home/sicherung/.ssh/authorized_keys
  chown root:root /home/sicherung/.ssh/authorized_keys
  chmod 644 /home/sicherung/.ssh/authorized_keys

  echo "  Freigegeben. Der Rechner im Buero holt die Sicherungen ab jetzt jeden Tag."
  echo "  Zum Pruefen dort in PowerShell:  Start-ScheduledTask Stegwerk-Sicherung"
}

hosting_einrichten() {
  local wirt=${1:-} port=${2:-65002}
  local ssh_schluessel=/root/.ssh/stegwerk_sicherung

  [ -n "$wirt" ] || { echo "Aufruf: bash $0 hosting BENUTZER@ADRESSE [PORT]"; exit 1; }

  sagen "SSH-Schluessel fuer das Hosting"
  [ -f "$ssh_schluessel" ] ||
    ssh-keygen -t ed25519 -N '' -C 'stegwerk-sicherung' -f "$ssh_schluessel" >/dev/null
  echo
  echo "  Im hPanel unter Erweitert → SSH-Zugang → SSH-Schluessel hinzufuegen:"
  echo
  cat "$ssh_schluessel.pub"
  echo
  read -r -p "  Hinzugefuegt? Dann Enter druecken. " _

  sagen "Verbindung pruefen"
  ssh -i "$ssh_schluessel" -p "$port" -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new "$wirt" \
    'mkdir -p ~/stegwerk-sicherungen && chmod 700 ~/stegwerk-sicherungen' ||
    { echo "  Keine Verbindung. Schluessel, Adresse und Port pruefen."; exit 1; }

  sagen "Verschluesselung"
  schluesselpaar
  setze SICHERUNG_ZIEL "$wirt"
  setze SICHERUNG_PORT "$port"

  erste_sicherung
}

case "${1:-}" in
  '') abholen_einrichten ;;
  freigeben) freigeben "${2:-}" ;;
  hosting) hosting_einrichten "${2:-}" "${3:-}" ;;
  *) echo "Unbekannt: $1"; exit 1 ;;
esac
