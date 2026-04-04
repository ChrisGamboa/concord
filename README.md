# Concord

Self-hostable Discord alternative built with TypeScript.

## Features

- Text channels with real-time messaging (WebSocket)
- Voice chat, video chat (1080p60), and screen sharing via LiveKit
- **Persistent voice sessions** -- stay connected while browsing text channels
- Music streaming from YouTube into voice channels (yt-dlp + LiveKit)
  - Debounced search-as-you-type
  - Queue management with drag-to-remove and clear
  - Pause/resume playback (affects all participants)
  - Skip and stop controls
  - Prefetches next track for near-gapless playback
  - Two-column panel layout (search + queue side by side)
- **Per-participant volume control** -- right-click any participant to adjust their volume or mute them (client-side only)
- **User profiles** -- customizable display name and avatar (auto-cropped to 256x256 WebP)
- File uploads with drag-and-drop and inline image embeds
- Typing indicators and user presence (online/offline)
- Message editing and deletion
- Permission system (bitmask roles)
- Desktop notifications
- RNNoise ML noise suppression for voice (WebAssembly AudioWorklet)

## Tech Stack

- **Client:** Electron + React + TypeScript + Zustand
- **Server:** Fastify + Prisma + PostgreSQL + Redis
- **Real-time:** WebSockets (chat) + LiveKit WebRTC (voice/video)
- **Music:** yt-dlp + ffmpeg + @livekit/rtc-node (server-side audio injection)
- **Image processing:** sharp (avatar resize/crop)

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

### 4. Start the server

```bash
pnpm dev:server
```

The API runs on `http://localhost:3001`. You should see log output confirming the server is listening.

### 5. Start the client

In a separate terminal:

```bash
pnpm dev:client
```

The Electron app opens with DevTools (in dev mode). Register an account and create a server to get started.

## Usage

### Text Chat
- Create a server via the `+` button in the left sidebar
- Share the server ID (click "Copy ID" in the channel sidebar header) with others so they can join
- Type in the message input and press Enter to send
- Drag and drop files to upload, or click the `+` button next to the input
- Hover over your own messages to edit or delete them

### Voice / Video / Screen Share
- Click a voice channel in the sidebar
- Click "Join Voice" to connect
- Use the control bar: Mic (toggle mute), Cam (toggle camera), Screen (share screen), Leave
- **Voice persists across navigation** -- switch to text channels while staying in the call
- The sidebar shows your voice connection status with mute toggle, return-to-call, and disconnect buttons
- Right-click any participant to adjust their volume or mute them on your client
- Audio-only calls show large centered participant cards; video calls show a responsive grid

### Music
- While connected to a voice channel, the music bar appears at the bottom
- Click it to expand the panel with search (left) and queue (right)
- Type to search YouTube -- results appear as you type (debounced)
- Click a result to queue it; the music bot joins and streams audio to all participants
- Controls: Pause/Resume, Skip, Stop
- The next queued track is prefetched in the background for minimal gap between songs
- Queue songs while browsing text channels -- the music bar stays visible

**Note:** Music requires `yt-dlp` and `ffmpeg` installed on the machine running the server.

### Profile & Settings
- Click the gear icon at the bottom of the server list to open Settings
- **My Account**: profile preview card, upload/remove avatar, edit display name inline
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

## Stopping

```bash
# Stop Docker services
docker compose stop

# Or remove everything (including data)
docker compose down -v
```
