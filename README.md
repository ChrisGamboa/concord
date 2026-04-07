# Concord

Self-hostable Discord alternative built with TypeScript.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
  - [Installing ffmpeg and yt-dlp](#installing-ffmpeg-and-yt-dlp)
- [Getting Started](#getting-started)
- [Usage](#usage)
  - [Text Chat](#text-chat)
  - [Voice / Video / Screen Share](#voice--video--screen-share)
  - [Music](#music)
  - [Roles & Permissions](#roles--permissions)
  - [Profile & Settings](#profile--settings)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Building Distributables](#building-distributables)
  - [Building the Server](#building-the-server)
  - [Building the Electron Client](#building-the-electron-client)
- [Hosting & Public Deployment](#hosting--public-deployment)
  - [Architecture Overview](#architecture-overview)
  - [Step 1: Provision a Server](#step-1-provision-a-server)
  - [Step 2: Domain & SSL](#step-2-domain--ssl)
  - [Step 3: Deploy Infrastructure (PostgreSQL, Redis, LiveKit)](#step-3-deploy-infrastructure-postgresql-redis-livekit)
  - [Step 4: Deploy the Concord Server](#step-4-deploy-the-concord-server)
  - [Step 5: Reverse Proxy with Nginx](#step-5-reverse-proxy-with-nginx)
  - [Step 6: Make the Client Connect to Your Server](#step-6-make-the-client-connect-to-your-server)
  - [Step 7: LiveKit Public Access](#step-7-livekit-public-access)
  - [Step 8: Distribute the Client](#step-8-distribute-the-client)
- [Deployment Scripts](#deployment-scripts)
- [Production Checklist](#production-checklist)
- [Stopping](#stopping)

## Features

- Text channels with real-time messaging (WebSocket)
- **Reactions** -- emoji reactions on messages with animated pills, quick picker from hover menu
- **Unread indicators** -- bold channel names with count badges, auto-mark-read on view
- **Link previews** -- Open Graph embeds for shared URLs (YouTube oEmbed, generic HTML scraping)
- **Image lightbox** -- click any image or GIF in chat for a full-screen preview
- **GIF picker** -- search and send GIFs inline via Klipy API
- **Direct messages** -- 1:1 private conversations, accessible from the DM icon in the server list
- Voice chat, video chat (1080p60), and screen sharing via LiveKit
  - **Video spotlight** -- click any video feed to focus it center-stage, others drop to a strip below
  - **Persistent voice sessions** -- stay connected while browsing text channels
  - Native OS screen picker for window-specific sharing
- Music streaming from YouTube into voice channels (yt-dlp + LiveKit)
  - Debounced search-as-you-type
  - Queue management with drag-to-remove and clear
  - Pause/resume playback (affects all participants)
  - Skip and stop controls
  - Prefetches next track for near-gapless playback
  - Two-column panel layout (search + queue side by side)
- **Per-participant volume control** -- right-click any participant to adjust their volume or mute them (client-side only)
- **Server customization** -- server name, icon (auto-cropped to 128x128 WebP), invite links
- **Invite system** -- generate shareable invite codes, join via code instead of raw server IDs
- **Roles & permissions** -- bitmask-based permission system with 12 granular permissions
  - Server Settings UI with Overview, Invites, and Roles tabs
  - Role assignment to members
  - Role badges with colors in the member list
  - Server owner is always admin
- **Moderation tools**
  - Voice: kick participants, server-mute (admins)
  - Text: delete any user's messages (MANAGE_MESSAGES permission)
  - Actions available via right-click context menus
- **User profiles** -- customizable display name, avatar (auto-cropped to 256x256 WebP), and custom status text
- File uploads with drag-and-drop and inline image embeds
- Typing indicators and user presence (online/offline)
- Message editing and deletion
- Desktop notifications
- RNNoise ML noise suppression for voice (WebAssembly AudioWorklet)
- **Custom title bar** -- frameless window with native traffic lights (macOS) or themed overlay (Windows)
- **Auto-updater** -- silent background updates via GitHub Releases with in-app notification banner

## Tech Stack

- **Client:** Electron + React + TypeScript + Zustand
- **Server:** Fastify + Prisma + PostgreSQL + Redis
- **Real-time:** WebSockets (chat) + LiveKit WebRTC (voice/video)
- **Music:** yt-dlp + ffmpeg + @livekit/rtc-node (server-side audio injection)
- **Image processing:** sharp (avatar/icon resize/crop)
- **GIFs:** Klipy API (server-side proxy)
- **Updates:** electron-updater + GitHub Releases (auto-update)

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10
- [Docker](https://www.docker.com/) (for PostgreSQL, Redis, LiveKit)
- [ffmpeg](https://ffmpeg.org/) (for music playback)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (for YouTube music search/extraction)

### Installing ffmpeg and yt-dlp

**macOS (Homebrew):**
```bash
brew install ffmpeg yt-dlp
```

**Linux (apt):**
```bash
sudo apt install ffmpeg
pip install yt-dlp
```

**Windows:**
```bash
choco install ffmpeg yt-dlp
```

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/ChrisGamboa/concord.git
cd concord
pnpm install
```

### 2. Start infrastructure

This starts PostgreSQL, Redis, and LiveKit in Docker:

```bash
docker compose up -d
```

### 3. Set up the database

```bash
pnpm --filter @concord/server db:push
```

### 4. Configure environment

Copy the example env and add your API keys:

```bash
cp packages/server/.env.example packages/server/.env
```

At minimum, add your Klipy API key for GIF support:

```
KLIPY_API_KEY=your_klipy_api_key
```

Get a free test key at [klipy.com/developers](https://klipy.com/developers) (100 requests/min, production keys are unlimited and free).

### 5. Start the server

```bash
pnpm dev:server
```

The API runs on `http://localhost:3001`.

### 6. Start the client

In a separate terminal:

```bash
pnpm dev:client
```

The Electron app opens with DevTools (in dev mode). Register an account and create a server to get started.

## Usage

### Text Chat
- Create a server via the `+` button in the left sidebar
- Share an invite code (Server Settings > Invites > Generate) or server ID with others to join
- Type in the message input and press Enter to send
- Click the **GIF** button to search and send GIFs inline
- Drag and drop files to upload, or click the `+` button next to the input
- Hover over messages to react (smiley icon), edit, or delete
- Click any image or GIF to open it in a **lightbox** (full-screen preview)
- URLs are auto-linked and show **Open Graph preview cards** (title, description, thumbnail)
- **Unread channels** appear bold with a count badge in the sidebar
- Click the chat bubble icon at the top of the server list for **Direct Messages**

### Voice / Video / Screen Share
- Click a voice channel in the sidebar
- Click "Join Voice" to connect
- Use the control bar: Mic (toggle mute), Cam (toggle camera), Screen (share screen), Leave
- **Voice persists across navigation** -- switch to text channels while staying in the call
- The sidebar shows your voice connection status with timer, mute toggle, return-to-call, and disconnect buttons
- Right-click any participant to adjust their volume, mute, or (with permissions) kick/server-mute
- Audio-only calls show large centered participant cards; video calls show a responsive grid
- Click any video feed to **spotlight** it (center-stage view with others in a strip below)

### Music
- While connected to a voice channel, the music bar appears at the bottom
- Click it to expand the panel with search (left) and queue (right)
- Type to search YouTube -- results appear as you type (debounced)
- Click a result to queue it; the music bot joins and streams audio to all participants
- Controls: Pause/Resume, Skip, Stop
- The next queued track is prefetched in the background for minimal gap between songs
- Queue songs while browsing text channels -- the music bar stays visible

**Note:** Music requires `yt-dlp` and `ffmpeg` installed on the machine running the server.

### Roles & Permissions
- Click the gear icon next to the server name to open **Server Settings**
- Create roles with custom names, colors, and permission toggles
- Assign roles to members to grant moderation capabilities
- Server owner automatically has full admin permissions
- Available permissions: Administrator, Manage Server/Channels/Roles/Messages, Kick/Ban Members, Send/Read Messages, Connect to Voice, Speak, Stream

### Profile & Settings
- Click the gear icon at the bottom of the server list to open Settings
- **My Account**: profile preview card, upload/remove avatar, edit display name, set custom status
- **Notifications**: toggle desktop notifications with a switch
- **Voice & Audio**: select input/output devices
- **Video**: select camera
- Log out from the sidebar

## Environment Variables

Server config lives in `packages/server/.env`. Defaults work with the Docker Compose setup:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://concord:concord_dev@localhost:5432/concord` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `JWT_SECRET` | `dev-secret-change-in-production` | JWT signing secret |
| `PORT` | `3001` | Server port |
| `LIVEKIT_URL` | `ws://localhost:7880` | LiveKit server WebSocket URL |
| `LIVEKIT_API_KEY` | `devkey` | LiveKit API key |
| `LIVEKIT_API_SECRET` | `secret` | LiveKit API secret |
| `KLIPY_API_KEY` | *(none)* | Klipy API key for GIF search ([get one free](https://klipy.com/developers)) |

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @concord/server test
pnpm --filter @concord/shared test
```

## Project Structure

```
packages/
  shared/     # Shared TypeScript types, WS protocol, API contracts
  server/     # Fastify API, WebSocket handler, Prisma ORM, music service
  client/     # Electron + React desktop app
```

## Building Distributables

### Building the Server

The server is a standard Node.js app. Build it to JavaScript and run directly:

```bash
# Build TypeScript to dist/
pnpm --filter @concord/server build

# Generate Prisma client
pnpm --filter @concord/server db:generate

# Run in production
cd packages/server
NODE_ENV=production node dist/index.js
```

The `dist/` folder, `node_modules/`, `prisma/`, and your `.env` are all you need to deploy the server. You don't need the rest of the monorepo at runtime.

### Building the Electron Client

The client uses `electron-vite` + `electron-builder`. Config is already in `packages/client/electron-builder.yml`.

**1. Add app icons** in `packages/client/build/` (create a 1024x1024 PNG and convert):
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `icon.png` (Linux, 512x512)

**2. Build:**

```bash
# Set your server URL (baked into the app at build time)
export VITE_SERVER_URL=https://concord.example.com

pnpm --filter @concord/client build:mac    # produces .dmg + .zip in release/
pnpm --filter @concord/client build:win    # produces .exe installer in release/
pnpm --filter @concord/client build:linux  # produces .AppImage + .deb in release/
```

**3. Build + publish to GitHub Releases (enables auto-updater):**

```bash
export GH_TOKEN=your_github_personal_access_token
export VITE_SERVER_URL=https://concord.example.com
pnpm --filter @concord/client build:publish
```

This uploads the installer to a GitHub Release tagged with the version from `package.json`. Existing clients auto-check for updates on launch and every 4 hours.

Output goes to `packages/client/release/`. Cross-compilation has limits -- build macOS on macOS, Windows on Windows (or use CI).

**CI/CD tip:** Use GitHub Actions with `electron-builder` action to build all platforms automatically. The `electron-builder` docs have [ready-made workflow templates](https://www.electron.build/multi-platform-build).

## Hosting & Public Deployment

### Architecture Overview

A public Concord deployment has these components, all of which need to be reachable by clients:

```
Clients (Electron apps)
    |
    |-- HTTPS --> Nginx --> Concord API server (Fastify, port 3001)
    |                          |-- PostgreSQL (port 5432)
    |                          |-- Redis (port 6379)
    |
    |-- WSS  --> Nginx --> Concord WebSocket (/ws)
    |
    |-- WebRTC --> LiveKit Server (ports 7880, 7881, 7882/udp)
```

PostgreSQL and Redis should **not** be publicly exposed -- only the API, WebSocket, and LiveKit need to be reachable from the internet.

### Step 1: Provision a Server

Any Linux VPS works. Recommended minimum specs:

- **CPU:** 2 cores (4+ if you expect heavy voice/video usage)
- **RAM:** 4 GB (LiveKit and ffmpeg are the hungry ones)
- **Disk:** 20 GB+ (uploads and database will grow)
- **OS:** Ubuntu 22.04 or Debian 12

Providers: Hetzner, DigitalOcean, Linode, AWS EC2, etc.

Install prerequisites on the server:

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Music dependencies
sudo apt install -y ffmpeg
pip install yt-dlp
```

### Step 2: Domain & SSL

Point a domain (e.g. `concord.example.com`) to your server's IP via an A record.

Use Certbot for free SSL:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d concord.example.com
```

Certbot auto-renews via systemd timer.

### Step 3: Deploy Infrastructure (PostgreSQL, Redis, LiveKit)

Use the existing `docker-compose.yml` with production tweaks. Create a `docker-compose.prod.yml`:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: concord
      POSTGRES_PASSWORD: <strong-random-password>
      POSTGRES_DB: concord
    ports:
      - "127.0.0.1:5432:5432"      # bind to localhost only
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass <redis-password>
    ports:
      - "127.0.0.1:6379:6379"      # bind to localhost only
    volumes:
      - redis_data:/data

  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    ports:
      - "7880:7880"
      - "7881:7881"
      - "7882:7882/udp"
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    command: --config /etc/livekit.yaml

volumes:
  postgres_data:
  redis_data:
```

Create a `livekit.yaml` for production LiveKit:

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 7882
  port_range_end: 7882
  use_external_ip: true
keys:
  your-api-key: <your-api-secret>
```

Generate a LiveKit key/secret pair:

```bash
# Any random strings work -- just keep them consistent between LiveKit config and your .env
openssl rand -base64 32   # use as API secret
```

Start infrastructure:

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Step 4: Deploy the Concord Server

Clone the repo on your server, install, and build:

```bash
git clone https://github.com/ChrisGamboa/concord.git
cd concord
pnpm install
pnpm --filter @concord/server build
pnpm --filter @concord/server db:push
```

Create `packages/server/.env` with production values:

```bash
DATABASE_URL=postgresql://concord:<db-password>@localhost:5432/concord
REDIS_URL=redis://:<redis-password>@localhost:6379
JWT_SECRET=<random-64-char-string>
PORT=3001
LIVEKIT_URL=wss://concord.example.com:7880
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=<your-api-secret>
KLIPY_API_KEY=<your-klipy-key>
```

Run with a process manager so it restarts on crash and boot:

```bash
# Install pm2
npm install -g pm2

# Start the server
cd packages/server
pm2 start dist/index.js --name concord-server

# Save and set up startup
pm2 save
pm2 startup
```

### Step 5: Reverse Proxy with Nginx

Nginx handles SSL termination, routes HTTP/WS traffic to Fastify, and (optionally) proxies LiveKit's WebSocket.

```nginx
server {
    listen 443 ssl http2;
    server_name concord.example.com;

    ssl_certificate     /etc/letsencrypt/live/concord.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/concord.example.com/privkey.pem;

    client_max_body_size 25M;   # match Fastify's 25MB upload limit

    # API routes
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # File uploads
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name concord.example.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/concord /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Step 6: Make the Client Connect to Your Server

All client URLs are centralized in `packages/client/src/renderer/lib/config.ts` and controlled by the `VITE_SERVER_URL` environment variable at build time. Default is `http://localhost:3001`.

Set the env when building the client:

```bash
VITE_SERVER_URL=https://concord.example.com pnpm --filter @concord/client build:mac
```

This bakes the server URL into the Electron app. Each distributable you produce points at a specific server.

### Step 7: LiveKit Public Access

LiveKit needs to be directly reachable by clients for WebRTC. You have two options:

**Option A: Direct exposure (simpler)**

Open ports 7880 (TCP), 7881 (TCP), and 7882 (UDP) on your firewall. Clients connect directly to `wss://concord.example.com:7880`. You'll need a separate SSL cert or use LiveKit's built-in TLS config in `livekit.yaml`:

```yaml
turn:
  enabled: true
  tls_port: 5349
```

**Option B: LiveKit Cloud (easier)**

Use [LiveKit Cloud](https://cloud.livekit.io/) instead of self-hosting. Replace `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in your `.env` with the values from your LiveKit Cloud project. This eliminates the need to manage WebRTC port forwarding, TURN servers, and LiveKit updates.

### Step 8: Distribute the Client

Once the client is built with your server URL baked in:

- **macOS:** Distribute the `.dmg`. For Gatekeeper to not block it, you need an Apple Developer account ($99/yr) to code-sign and notarize. Without it, users must right-click > Open to bypass the warning.
- **Windows:** Distribute the `.exe` installer from the NSIS build. Code-signing requires a certificate from a CA (DigiCert, Sectigo, etc.). Unsigned installers trigger SmartScreen warnings.
- **Linux:** Distribute the `.AppImage` (universal) or `.deb` (Debian/Ubuntu). No signing requirements.

Host the files anywhere: GitHub Releases, S3, your own server, etc. GitHub Releases is the easiest since it integrates with `electron-builder`'s publish feature.

## Deployment Scripts

The `scripts/` directory has automation for production deployment:

| Script | Purpose |
|---|---|
| `scripts/setup-server.sh` | Run once on a fresh VPS. Installs Node 22, pnpm, Docker, Nginx, Certbot, ffmpeg, yt-dlp, pm2. |
| `scripts/generate-env.sh` | Interactive. Prompts for domain + Klipy key, generates random secrets, outputs `.env`, `livekit.yaml`, and nginx config. |
| `scripts/deploy.sh` | Idempotent deploy/update. Pulls code, builds, pushes DB schema, restarts pm2. |

Quick start on a fresh VPS:

```bash
git clone https://github.com/ChrisGamboa/concord.git && cd concord
sudo bash scripts/setup-server.sh
bash scripts/generate-env.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
bash scripts/deploy.sh
```

## Production Checklist

- [ ] Change `JWT_SECRET` to a random string (64+ chars)
- [ ] Set strong passwords for PostgreSQL and Redis
- [ ] Bind PostgreSQL and Redis to `127.0.0.1` only (not public)
- [ ] Configure a firewall (UFW) -- allow only 22, 80, 443, 7880-7882
- [ ] Set up SSL with Certbot (auto-renew)
- [ ] Use `pm2` or systemd to keep the server process alive
- [ ] Set up database backups (`pg_dump` on a cron)
- [ ] Build client with `VITE_SERVER_URL` set to your production domain
- [ ] Code-sign the Electron app (macOS/Windows) if distributing publicly
- [ ] Set up LiveKit with a real key pair (not `devkey`/`secret`)
- [ ] Configure `uploads/` directory persistence (not lost on redeploy)
- [ ] Set `NODE_ENV=production`

## Stopping

```bash
# Stop Docker services
docker compose stop

# Or remove everything (including data)
docker compose down -v
```
