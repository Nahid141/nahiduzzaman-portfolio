#!/usr/bin/env bash
# Private Connect backend: first install / update on Ubuntu 24.04 (run as root).
#
#   sudo bash install.sh            # install or update code + services
#
# Secrets (DB password, data key) are generated here on the VM and written only to
# /etc/connect-backend.env (mode 600). SMTP credentials are added separately with
# `sudo bash set-smtp.sh`, which prompts with hidden input.
set -euo pipefail

APP_DIR=/opt/connect-backend
ENV_FILE=/etc/connect-backend.env
DOMAIN=connect-api.fnunahiduzzaman.com
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

apt-get update -y
apt-get install -y ca-certificates curl gnupg nginx postgresql redis-server certbot python3-certbot-nginx rsync

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Redis: local only, no persistence needed for presence/rate limits.
sed -i 's/^#\? *bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
systemctl enable --now redis-server

id connect >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin connect

if [ ! -f "$ENV_FILE" ]; then
  DB_PASS="$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE connect LOGIN PASSWORD '${DB_PASS}';
CREATE DATABASE connect OWNER connect;
SQL
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=8020
TRUST_PROXY=127.0.0.1
DATABASE_URL=postgres://connect:${DB_PASS}@127.0.0.1:5432/connect
REDIS_URL=redis://127.0.0.1:6379
CONNECT_SITE_ORIGIN=https://www.fnunahiduzzaman.com,https://fnunahiduzzaman.com
CONNECT_DATA_KEY=$(openssl rand -base64 32)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
ENV
  chown root:connect "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  echo "Created $ENV_FILE. Add SMTP credentials with: sudo bash $SRC_DIR/deploy/set-smtp.sh"
fi

mkdir -p "$APP_DIR"
rsync -a --delete --exclude node_modules --exclude .pglite --exclude test "$SRC_DIR/" "$APP_DIR/"
chown -R connect:connect "$APP_DIR"
sudo -u connect bash -c "cd $APP_DIR && npm ci --omit=dev --no-audit --no-fund"

install -m 644 "$SRC_DIR/deploy/connect-backend.service" /etc/systemd/system/connect-backend.service
systemctl daemon-reload
systemctl enable connect-backend

# Nginx: refuse to overwrite a different existing site with the same name.
SITE=/etc/nginx/sites-available/$DOMAIN
if [ -e "$SITE" ] && ! grep -q "connect-backend" "$SITE"; then
  echo "Refusing to overwrite $SITE (not created by this script)." >&2
  exit 1
fi
install -m 644 "$SRC_DIR/deploy/nginx-connect-api.conf" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/$DOMAIN
nginx -t
systemctl reload nginx

if grep -q '^SMTP_PASSWORD=.\+' "$ENV_FILE"; then
  systemctl restart connect-backend
  echo "connect-backend restarted."
else
  echo "SMTP not configured yet: run deploy/set-smtp.sh, then: systemctl restart connect-backend"
fi
