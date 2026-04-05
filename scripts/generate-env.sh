#!/usr/bin/env bash
set -euo pipefail

# Generate production environment files with random secrets.
# Run this once on your production server before deploying.

echo "=== Concord Production Environment Generator ==="
echo ""

# Prompt for domain
read -rp "Domain (e.g. concord.example.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
  echo "Error: domain is required"
  exit 1
fi

# Prompt for optional Klipy key
read -rp "Klipy API key (leave empty to skip GIF support): " KLIPY_KEY

# Generate random secrets
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
LIVEKIT_API_KEY="concord-$(openssl rand -hex 4)"
LIVEKIT_API_SECRET=$(openssl rand -base64 32)

echo ""
echo "Generating configs..."

# --- Server .env ---
cat > packages/server/.env <<EOF
DATABASE_URL=postgresql://concord:${POSTGRES_PASSWORD}@localhost:5432/concord
REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:6379
JWT_SECRET=${JWT_SECRET}
PORT=3001
LIVEKIT_URL=wss://${DOMAIN}:7880
LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
KLIPY_API_KEY=${KLIPY_KEY}
EOF
echo "  -> packages/server/.env"

# --- Docker compose .env (for variable substitution) ---
cat > .env.prod <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
EOF
echo "  -> .env.prod"

# --- LiveKit config ---
mkdir -p deploy
cat > deploy/livekit.yaml <<EOF
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 7882
  port_range_end: 7882
  use_external_ip: true
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
EOF
echo "  -> deploy/livekit.yaml"

# --- Nginx config ---
sed "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" deploy/nginx.conf.template > "deploy/nginx-${DOMAIN}.conf"
echo "  -> deploy/nginx-${DOMAIN}.conf"

echo ""
echo "=== Done! Next steps: ==="
echo ""
echo "1. Start infrastructure:"
echo "   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d"
echo ""
echo "2. Build and deploy the server:"
echo "   pnpm install && pnpm --filter @concord/shared build && pnpm --filter @concord/server build"
echo "   pnpm --filter @concord/server db:push"
echo "   pm2 start packages/server/dist/index.js --name concord-server"
echo ""
echo "3. Install the nginx config:"
echo "   sudo cp deploy/nginx-${DOMAIN}.conf /etc/nginx/sites-available/concord"
echo "   sudo ln -sf /etc/nginx/sites-available/concord /etc/nginx/sites-enabled/"
echo "   sudo certbot --nginx -d ${DOMAIN}"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "4. Open firewall ports:"
echo "   sudo ufw allow 22,80,443/tcp"
echo "   sudo ufw allow 7880:7882/tcp"
echo "   sudo ufw allow 7882/udp"
echo "   sudo ufw enable"
echo ""
echo "5. Build the client (on your dev machine):"
echo "   VITE_SERVER_URL=https://${DOMAIN} pnpm --filter @concord/client build:dist"
echo ""
