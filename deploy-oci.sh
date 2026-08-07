#!/usr/bin/env bash
#
# deploy-oci.sh
# One-shot setup for the Laptop Inventory app on an Oracle Cloud Always Free
# Ubuntu VM. Installs Node.js + Nginx + PM2, builds the app, wires up the
# Google Sheets database, and enables HTTPS via Let's Encrypt.
#
# Usage:
#   1) SSH into your Oracle VM (Ubuntu 22.04/24.04) as user `ubuntu`.
#   2) Make sure the repo is on the VM:  git clone ... or scp -r project laptop-inventory
#   3) Run:  bash deploy-oci.sh <domain-or-ip>  [optional domain for HTTPS]
#
# Cost: $0/month (Oracle Always Free). PM2 keeps the app running 24/7 and
# restarts it on boot, so no manual starting is ever needed.
#
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="${2:-$HOME/laptop-inventory}"
PORT="${PORT:-4000}"

log()  { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

# --------------------------------------------------------------------------
# 1. System packages + Node.js
# --------------------------------------------------------------------------
log "Installing system packages..."
sudo apt-get update -y
sudo apt-get install -y curl git nginx

if ! command -v node >/dev/null 2>&1; then
  log "Installing Node.js 22 (Nodesource)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

log "Node $(node -v) / npm $(npm -v)"

# --------------------------------------------------------------------------
# 2. Build the app (installs backend + frontend deps, builds frontend/dist)
# --------------------------------------------------------------------------
if [ ! -d "$APP_DIR" ]; then
  warn "App directory $APP_DIR not found."
  warn "Clone it first:  git clone <your-repo> $APP_DIR   then re-run this script."
  exit 1
fi

log "Building app in $APP_DIR..."
cd "$APP_DIR"
npm run build

# --------------------------------------------------------------------------
# 3. Configure backend/.env (Google Sheets DB + secrets)
# --------------------------------------------------------------------------
ENV_FILE="$APP_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Creating backend/.env"
  cat > "$ENV_FILE" <<EOF
PORT=$PORT
STORAGE_DRIVER=sheets
SHEETS_SPREADSHEET_ID=PASTE_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON={PASTE_SERVICE_ACCOUNT_JSON}
JWT_SECRET=$(head -c 64 /dev/urandom | base64 | tr -d '\n')
EOF
  warn ">>> backend/.env created. Edit it and fill in:"
  warn "    SHEETS_SPREADSHEET_ID        (from your Google Sheet URL)"
  warn "    GOOGLE_SERVICE_ACCOUNT_JSON  (the service-account key file)"
  warn "    Run:  sudo nano $ENV_FILE"
else
  log "backend/.env already exists — leaving it as-is."
fi

# --------------------------------------------------------------------------
# 4. PM2 — keep the app alive 24/7 and restart on boot
# --------------------------------------------------------------------------
log "Installing + configuring PM2..."
sudo npm install -g pm2
pm2 delete laptop >/dev/null 2>&1 || true
pm2 start "$APP_DIR/backend/server.js" --name laptop
pm2 save
eval "$(pm2 startup systemd -u "$(whoami)" --hp "$HOME" | tail -1)" || true

log "PM2 status:"
pm2 status laptop || true

# --------------------------------------------------------------------------
# 5. Nginx reverse proxy (port 80 -> :4000), WebSocket support for Socket.io
# --------------------------------------------------------------------------
log "Configuring Nginx..."
NGINX_CONF="/etc/nginx/sites-available/laptop"
SERVER_NAME="${DOMAIN:+$DOMAIN}"
sudo tee "$NGINX_CONF" >/dev/null <<EOF
server {
  listen 80;
  server_name ${SERVER_NAME:-_};
  client_max_body_size 10m;

  location / {
    proxy_pass http://localhost:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/laptop
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# --------------------------------------------------------------------------
# 6. HTTPS via Let's Encrypt (only if a domain was supplied)
# --------------------------------------------------------------------------
if [ -n "$DOMAIN" ]; then
  log "Installing Let's Encrypt for $DOMAIN..."
  sudo apt-get install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
  log "HTTPS enabled. Visit https://$DOMAIN"
else
  warn "No domain supplied — using plain HTTP at http://<vm-ip>. Re-run with a"
  warn "domain later for free HTTPS:  bash deploy-oci.sh yourdomain.com"
fi

# --------------------------------------------------------------------------
# 7. Verify
# --------------------------------------------------------------------------
IP="$(curl -s ifconfig.me || true)"
log "Done!"
if [ -n "$DOMAIN" ]; then
  log "  Site:  https://$DOMAIN"
else
  log "  Site:  http://$IP"
fi
log "  Health: $(curl -s http://localhost:${PORT}/api/health || echo 'waiting...')"
log "  PM2 will auto-restart the app on reboot. Everything is lifetime-free."
