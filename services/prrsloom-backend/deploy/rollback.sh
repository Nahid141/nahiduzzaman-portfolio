#!/usr/bin/env bash
# Roll back PRRSLooM. Usage: sudo bash rollback.sh [backup-stamp]   (default: newest backup)
#   --remove   stop and disable the service and remove the nginx include (QI-GeneX-N is untouched)
set -euo pipefail
if [ "${1:-}" = "--remove" ]; then
  systemctl disable --now prrsloom.service || true
  for f in $(grep -rl "snippets/prrsloom.conf" /etc/nginx/sites-enabled/ 2>/dev/null); do
    sed -i '/snippets\/prrsloom.conf/d' "$(readlink -f "$f")"
  done
  nginx -t && systemctl reload nginx
  echo "PRRSLooM disabled; data in /srv/prrsloom kept."
  exit 0
fi
B=/opt/prrsloom/backups/${1:-$(ls -1 /opt/prrsloom/backups | tail -1)}
[ -d "$B" ] || { echo "no backup $B" >&2; exit 1; }
[ -d "$B/app" ] && { rm -rf /opt/prrsloom/app; cp -a "$B/app" /opt/prrsloom/app; }
[ -f "$B/prrsloom.service" ] && cp -a "$B/prrsloom.service" /etc/systemd/system/prrsloom.service
if [ -f "$B/nginx-site.conf" ]; then
  T="$(readlink -f "$(grep -rl "fnunahiduzzaman" /etc/nginx/sites-enabled/ | head -1)")"
  cp -a "$B/nginx-site.conf" "$T"
fi
systemctl daemon-reload; systemctl restart prrsloom.service
nginx -t && systemctl reload nginx
echo "Restored $B"
