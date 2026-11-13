# ============================================================================
# ZK-SONG — VPS bootstrap (Ubuntu/Debian)
#
# Run on a fresh 2-core / 4 GB server as root (or via sudo):
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/ZK-SONG/<branch>/deploy/vps-setup.sh -o setup.sh
#   sudo bash setup.sh
#
# It installs Node 22, nginx + certbot, creates the system user, builds the app
# into /opt/zksong, writes the systemd unit and prints the remaining steps.
# Idempotent: safe to re-run after a git pull.
# ============================================================================
set -euo pipefail

APP_USER="zksong"
APP_DIR="/opt/zksong"
SERVICE="zksong"
PORT="${PORT:-4000}"
DOMAIN="${DOMAIN:-}"

log() { printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: sudo bash $0" >&2
  exit 1
fi

log "Installing Node.js 22, nginx, git and certbot"
apt-get update -qq
apt-get install -y -qq curl ca-certificates git nginx ffmpeg ufw >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

log "Creating the $APP_USER system account"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" /var/lib/zksong
chown -R "$APP_USER:$APP_USER" "$APP_DIR" /var/lib/zksong

log "Firewall (22, 80, 443)"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

log "Writing the environment file (/etc/zksong.env)"
if [ ! -f /etc/zksong.env ]; then
  JWT=$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-48)
  cat > /etc/zksong.env <<EOF
# --- ZK-SONG runtime configuration -------------------------------------------
NODE_ENV=production
PORT=$PORT

# Public URL of the site (used for CORS + absolute media links)
APP_ORIGIN=${DOMAIN:+https://$DOMAIN}
ALLOWED_ORIGIN=${DOMAIN:+https://$DOMAIN}

# Admin account created on first boot
ADMIN_EMAIL=admin@gmail.com
ADMIN_PASSWORD=CHANGE-THIS-BEFORE-STARTING
ADMIN_NAME=Platform Administrator

# Sessions — generated for you, do not share
JWT_SECRET=$JWT

# Storage: this VPS keeps the SQLite database and media on local disk
DATA_DIR=/var/lib/zksong
UPLOADS_DIR=$APP_DIR/server/uploads
MAX_UPLOAD_MB=120
EOF
  chmod 600 /etc/zksong.env
  echo "  created /etc/zksong.env — edit ADMIN_PASSWORD before starting!"
else
  echo "  /etc/zksong.env already exists, leaving it untouched"
fi

log "Creating the $SERVICE systemd service"
cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=ZK-SONG API & streaming server
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/zksong.env
ExecStart=/usr/bin/node --no-warnings server/index.js
Restart=always
RestartSec=3
# Media uploads are streamed; keep the journal readable
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/var/lib/zksong $APP_DIR/server/uploads

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable $SERVICE >/dev/null 2>&1 || true

log "Creating the nginx site"
cat > /etc/nginx/sites-available/zksong <<EOF
# ZK-SONG — reverse proxy. nginx serves range requests for media so audio
# scrubbing stays smooth even under load.
server {
    listen 80;
    server_name ${DOMAIN:-_};

    # 120 MB audio masters + overhead
    client_max_body_size 130m;
    client_body_timeout 300s;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection        "";
        # Large uploads must not be buffered by nginx
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/zksong /etc/nginx/sites-enabled/zksong
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cat <<EOF

────────────────────────────────────────────────────────────────────────────
✅ System ready. Remaining steps (run as your normal user, not root):

 1. Get the code:
      sudo git clone <your-repo-url> $APP_DIR
      sudo chown -R $APP_USER:$APP_USER $APP_DIR

 2. Build + start:
      cd $APP_DIR
      sudo -u $APP_USER npm ci
      sudo -u $APP_USER npm run build
      sudo nano /etc/zksong.env          # set ADMIN_PASSWORD + ALLOWED_ORIGIN
      sudo systemctl restart $SERVICE
      sudo systemctl status $SERVICE

 3. Check it:
      curl localhost:$PORT/api/health
      curl localhost:$PORT/api/public/bootstrap

 4. HTTPS (only after the domain's DNS A record points here):
      sudo certbot --nginx -d ${DOMAIN:-your-domain.com}

 5. Backups (database + media together):
      sudo -u $APP_USER tar czf /var/lib/zksong/backup-\$(date +%F).tar.gz \\
        $APP_DIR/server/data $APP_DIR/server/uploads

 Logs & updates:
      journalctl -u $SERVICE -f
      cd $APP_DIR && sudo -u $APP_USER git pull && sudo -u $APP_USER npm ci \\
        && sudo -u $APP_USER npm run build && sudo systemctl restart $SERVICE
────────────────────────────────────────────────────────────────────────────
EOF
