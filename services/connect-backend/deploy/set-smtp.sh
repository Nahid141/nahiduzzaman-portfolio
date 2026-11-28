#!/usr/bin/env bash
# Stores Google Workspace / Gmail SMTP credentials in /etc/connect-backend.env.
# The app password is read with echo disabled and never printed.
#
#   sudo bash set-smtp.sh
set -euo pipefail
ENV_FILE=/etc/connect-backend.env

read -r -p "Sending Google account (e.g. nahid007@umn.edu): " SMTP_USER
read -r -s -p "16-character app password (input hidden): " SMTP_PASSWORD
echo
SMTP_PASSWORD="${SMTP_PASSWORD// /}"
[ ${#SMTP_PASSWORD} -ge 16 ] || { echo "That does not look like an app password." >&2; exit 1; }

tmp="$(mktemp)"
grep -v -E '^(SMTP_USER|SMTP_PASSWORD|MAIL_FROM)=' "$ENV_FILE" > "$tmp"
{
  echo "SMTP_USER=$SMTP_USER"
  echo "SMTP_PASSWORD=$SMTP_PASSWORD"
  echo "MAIL_FROM=Private Connect <$SMTP_USER>"
} >> "$tmp"
install -o root -g connect -m 640 "$tmp" "$ENV_FILE"
rm -f "$tmp"
systemctl restart connect-backend
echo "SMTP saved and connect-backend restarted."
