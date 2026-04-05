#!/usr/bin/env bash
set -euo pipefail

# Deploy or update Concord on a production server.
# Assumes generate-env.sh has already been run and infrastructure is up.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "=== Deploying Concord ==="

# Pull latest code if in a git repo
if [ -d .git ]; then
  echo "-> Pulling latest code..."
  git pull --ff-only
fi

# Install dependencies
echo "-> Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Build shared package first (server and client depend on it)
echo "-> Building shared types..."
pnpm --filter @concord/shared build

# Build server
echo "-> Building server..."
pnpm --filter @concord/server build

# Run database migrations
echo "-> Pushing database schema..."
pnpm --filter @concord/server db:push

# Restart the server process
if command -v pm2 &> /dev/null; then
  if pm2 list | grep -q "concord-server"; then
    echo "-> Restarting server via pm2..."
    pm2 restart concord-server
  else
    echo "-> Starting server via pm2..."
    pm2 start packages/server/dist/index.js --name concord-server
    pm2 save
  fi
else
  echo ""
  echo "WARNING: pm2 not found. Install it with: npm install -g pm2"
  echo "Then run: pm2 start packages/server/dist/index.js --name concord-server"
fi

echo ""
echo "=== Deploy complete! ==="
echo "Health check: curl -s http://localhost:3001/health"
