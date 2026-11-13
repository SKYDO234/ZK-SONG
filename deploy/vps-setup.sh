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
REPO_URL="${REPO_URL:-https://github.com/SKYDO234/ZK-SONG.git}"
BRANCH="${BRANCH:-main}"

# Cloudflare Tunnel mode: run with TUNNEL=1 and the script skips nginx/certbot
# (cloudflared terminates TLS) and lowers MAX_UPLOAD_MB to fit Cloudflare's
# 100 MB request-body cap on the Free and Pro plans.
# Low-memory mode for 512 MB boxes: a 1 GB swap file plus a capped Node heap.
# Building the site peaks at ~423 MB RSS, which OOM-kills a 512 MB host with no
# swap; the server itself only needs ~73 MB at runtime.
SWAP_GB="${SWAP_GB:-1}"
if [ "${LOW_MEM:-0}" = "1" ] || [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -lt 1000 ]; then
  LOW_MEM=1
else
  LOW_MEM=0
fi
NODE_HEAP_MB="${NODE_HEAP_MB:-384}"

TUNNEL="${TUNNEL:-0}"
if [ "$TUNNEL" = "1" ]; then
  MAX_UPLOAD_MB="${MAX_UPLOAD_MB:-95}"
else
  MAX_UPLOAD_MB="${MAX_UPLOAD_MB:-120}"
fi

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

if [ "$LOW_MEM" = "1" ]; then
  if swapon --show 2>/dev/null | grep -q .; then
    log "Swap already active"
  else
    log "Adding ${SWAP_GB} GB swap (required to run the frontend build in 512 MB)"
    fallocate -l "${SWAP_GB}G" /swapfile 2>/dev/null \
      || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -qw vm.swappiness=10 || true
    sysctl -qw vm.vfs_cache_pressure=50 || true
  fi
  free -m | head -2
fi

log "Firewall"
ufw allow OpenSSH >/dev/null 2>&1 || true
if [ "$TUNNEL" = "1" ]; then
  # Only SSH is needed: cloudflared makes outbound connections, nothing inbound.
  ufw deny 80/tcp >/dev/null 2>&1 || true
  ufw deny 443/tcp >/dev/null 2>&1 || true
else
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
fi
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
UPLOADS_DIR=/var/lib/zksong/uploads
MAX_UPLOAD_MB=$MAX_UPLOAD_MB

# Keep the runtime inside the tiny RAM budget (uploads are streamed, not buffered)
NODE_OPTIONS=--max-old-space-size=$NODE_HEAP_MB
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
ReadWritePaths=/var/lib/zksong

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable $SERVICE >/dev/null 2>&1 || true

if [ "$TUNNEL" = "1" ]; then
  log "Tunnel mode: skipping nginx (cloudflared connects straight to the app)"
  systemctl disable --now nginx >/dev/null 2>&1 || true
else
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
if [ "$LOW_MEM" = "1" ]; then
  cat > /etc/nginx/conf.d/zz-low-memory.conf <<'NGINXEOF'
# ZK-SONG on a 512 MB VPS: a single worker handles this traffic profile
worker_processes 1;
worker_rlimit_nofile 4096;
events { worker_connections 512; }
NGINXEOF
fi

ln -sf /etc/nginx/sites-available/zksong /etc/nginx/sites-enabled/zksong
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
fi

log "Fetching the application code"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  rm -rf "$APP_DIR"
  sudo -u "$APP_USER" git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Installing dependencies and building the website"
sudo -u "$APP_USER" bash -lc "cd $APP_DIR \
  && npm ci --silent \
  && NODE_OPTIONS=--max-old-space-size=$NODE_HEAP_MB npm run build \
  && npm prune --omit=dev --silent"

log "Preparing local media directories"
sudo -u "$APP_USER" mkdir -p /var/lib/zksong/uploads/{audio,thumbnails,videos,avatars,branding}
mkdir -p /var/backups/zksong
chown "$APP_USER:$APP_USER" /var/backups/zksong

cat <<EOF

────────────────────────────────────────────────────────────────────────────
✅ System ready — code fetched, dependencies installed, website built.

 Set your password, then start the service:

    sudo nano /etc/zksong.env      # ADMIN_PASSWORD, ALLOWED_ORIGIN
    sudo systemctl restart $SERVICE
    sudo systemctl status $SERVICE
    journalctl -u $SERVICE -f

 Check it:
      curl localhost:$PORT/api/health
      curl localhost:$PORT/api/public/bootstrap

EOF

if [ "$TUNNEL" = "1" ]; then
cat <<EOF
 Point your Cloudflare Tunnel at the app (no nginx, no certbot, no open ports):

      sudo cloudflared tunnel --url http://localhost:$PORT      # quick test URL
      # or, for a permanent hostname:
      sudo cloudflared tunnel create zksong
      sudo cloudflared tunnel route dns zksong ${DOMAIN:-your-domain.com}
      sudo cloudflared service install

 Uploads are capped at ${MAX_UPLOAD_MB} MB to stay under Cloudflare's 100 MB
 request-body limit (Free and Pro plans return 413 above that).

EOF
else
cat <<EOF
 HTTPS (only after the domain's DNS A record points here):
      sudo certbot --nginx -d ${DOMAIN:-your-domain.com}

EOF
fi

cat <<EOF

 Backups (database + media together):
      sudo mkdir -p /var/backups/zksong
      sudo -u $APP_USER tar czf /var/backups/zksong/backup-\$(date +%F).tar.gz \\
        /var/lib/zksong

 Update the site later:
      sudo bash $APP_DIR/deploy/vps-setup.sh   # re-run: fetches, builds, keeps data

 Logs:
      journalctl -u $SERVICE -f
────────────────────────────────────────────────────────────────────────────
EOF
