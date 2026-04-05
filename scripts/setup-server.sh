#!/usr/bin/env bash
set -euo pipefail

# Bootstrap a fresh Ubuntu/Debian VPS with all Concord prerequisites.
# Run as root or with sudo.

echo "=== Concord Server Setup ==="

# Node.js 22
echo "-> Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# pnpm
echo "-> Installing pnpm..."
corepack enable
corepack prepare pnpm@latest --activate

# Docker
echo "-> Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "${SUDO_USER:-$USER}"
fi

# Nginx
echo "-> Installing Nginx..."
apt install -y nginx

# Certbot
echo "-> Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# Music dependencies
echo "-> Installing ffmpeg and yt-dlp..."
apt install -y ffmpeg python3-pip
pip3 install yt-dlp || pip install yt-dlp

# pm2
echo "-> Installing pm2..."
npm install -g pm2

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. git clone your repo"
echo "  2. cd concord && bash scripts/generate-env.sh"
echo "  3. bash scripts/deploy.sh"
