#!/usr/bin/env bash
# Idempotent install/upgrade of the PRRSLooM backend on the Oracle host (Ubuntu).
# Usage (from the uploaded source dir):  sudo bash deploy/install.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=/opt/prrsloom/backups/$STAMP
API_HOST="${PRRSLOOM_HOST:-api.fnunahiduzzaman.com}"   # e.g. PRRSLOOM_HOST=prrsloom-api.fnunahiduzzaman.com

apt-get install -y -qq clustalw mafft python3-venv nginx curl >/dev/null
id prrsloom >/dev/null 2>&1 || useradd --system --home /srv/prrsloom --shell /usr/sbin/nologin prrsloom
install -d -o prrsloom -g prrsloom -m 750 /srv/prrsloom /srv/prrsloom/jobs
install -d -m 755 /opt/prrsloom /opt/prrsloom/backups /etc/prrsloom
mkdir -p "$BACKUP"

# 1. code (previous version kept for rollback)
[ -d /opt/prrsloom/app ] && cp -a /opt/prrsloom/app "$BACKUP/app"
rm -rf /opt/prrsloom/app.new && mkdir -p /opt/prrsloom/app.new
cp -a "$SRC/prrsloom" "$SRC/requirements.txt" /opt/prrsloom/app.new/
rm -rf /opt/prrsloom/app && mv /opt/prrsloom/app.new /opt/prrsloom/app

# 2. venv
[ -x /opt/prrsloom/venv/bin/python ] || python3 -m venv /opt/prrsloom/venv
/opt/prrsloom/venv/bin/pip install -q --upgrade pip
/opt/prrsloom/venv/bin/pip install -q -r /opt/prrsloom/app/requirements.txt

[ -f /etc/nginx/snippets/prrsloom.conf ] && cp -a /etc/nginx/snippets/prrsloom.conf "$BACKUP/nginx-snippet.conf"

# 3. env + unit (an existing env file is kept, and backed up so rollback.sh can restore it)
[ -f /etc/prrsloom/prrsloom.env ] && cp -a /etc/prrsloom/prrsloom.env "$BACKUP/prrsloom.env"
[ -f /etc/prrsloom/prrsloom.env ] || install -m 640 -g prrsloom "$SRC/deploy/prrsloom.env.example" /etc/prrsloom/prrsloom.env
[ -f /etc/systemd/system/prrsloom.service ] && cp -a /etc/systemd/system/prrsloom.service "$BACKUP/"
install -m 644 "$SRC/deploy/prrsloom.service" /etc/systemd/system/prrsloom.service
systemctl daemon-reload
systemctl enable --now prrsloom.service
systemctl restart prrsloom.service

# 4. nginx: add /prrsloom/ to the API server block (backup first, auto-restore on failure)
# -R (not -r): sites-enabled entries are symlinks, which -r does not follow
CONF="$(grep -Rl "server_name[^;]*$API_HOST" /etc/nginx/sites-enabled/ 2>/dev/null | head -1 || true)"
if [ -n "$CONF" ]; then
  REAL="$(readlink -f "$CONF")"
  cp -a "$REAL" "$BACKUP/nginx-site.conf"
  install -m 644 "$SRC/deploy/nginx-prrsloom.conf" /etc/nginx/snippets/prrsloom.conf
  if ! grep -q "snippets/prrsloom.conf" "$REAL"; then
    # insert after the first server_name line of the block that listens on 443
    python3 - "$REAL" "$API_HOST" <<'PY'
import re, sys
path, host = sys.argv[1], sys.argv[2]
text = open(path).read()
blocks = [m for m in re.finditer(r"server_name[^;]*" + re.escape(host) + r"[^;]*;", text)]
target = None
for m in blocks:
    start = text.rfind("server", 0, m.start())
    block = text[start:m.end() + 2000]
    if "443" in block:
        target = m; break
target = target or blocks[0]
text = text[:target.end()] + "\n    include snippets/prrsloom.conf;" + text[target.end():]
open(path, "w").write(text)
PY
  fi
  if nginx -t; then systemctl reload nginx; else cp -a "$BACKUP/nginx-site.conf" "$REAL"; nginx -t && systemctl reload nginx; echo "nginx change reverted" >&2; exit 1; fi
elif [ -e /etc/nginx/sites-available/prrsloom-api ]; then
  # never overwrite an existing site file (it carries certbot's HTTPS server block)
  echo "nginx: /etc/nginx/sites-available/prrsloom-api exists but has no server_name $API_HOST; left unchanged" >&2
  cp -a /etc/nginx/sites-available/prrsloom-api "$BACKUP/nginx-site.conf"
  install -m 644 "$SRC/deploy/nginx-prrsloom.conf" /etc/nginx/snippets/prrsloom.conf
  if nginx -t; then systemctl reload nginx; else cp -a "$BACKUP/nginx-snippet.conf" /etc/nginx/snippets/prrsloom.conf; nginx -t && systemctl reload nginx; exit 1; fi
else
  # dedicated host (e.g. a new VM): own site file, HTTP first; HTTPS is added by certbot once DNS points here
  install -m 644 "$SRC/deploy/nginx-prrsloom.conf" /etc/nginx/snippets/prrsloom.conf
  cat > /etc/nginx/sites-available/prrsloom-api <<NGX
server {
    listen 80;
    listen [::]:80;
    server_name $API_HOST;
    location = / { return 204; }
    include snippets/prrsloom.conf;
}
NGX
  ln -sf /etc/nginx/sites-available/prrsloom-api /etc/nginx/sites-enabled/prrsloom-api
  nginx -t && systemctl reload nginx
fi

# 5. warm resources + health
sleep 2
cd /opt/prrsloom/app && sudo -u prrsloom env PYTHONPATH=/opt/prrsloom/app $(grep -v '^#' /etc/prrsloom/prrsloom.env | xargs) /opt/prrsloom/venv/bin/python -c \
  "from prrsloom import resources; resources.ensure_all(); resources.load_model('model'); resources.load_model('lineage_model'); print('resources ok')"
curl -fsS http://127.0.0.1:8010/prrsloom/health && echo
echo "Backup of previous state: $BACKUP"
