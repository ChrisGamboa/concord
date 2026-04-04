# Concord

Self-hostable Discord alternative built with TypeScript.

## Features

- Text channels with real-time messaging (WebSocket)
- **GIF picker** -- search and send GIFs inline via Klipy API
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
- **Roles & permissions** -- bitmask-based permission system with 12 granular permissions
  - Server Settings UI for creating, editing, and deleting roles with color and permission toggles
  - Role assignment to members
  - Role badges with colors in the member list
  - Server owner is always admin
- **Moderation tools**
  - Voice: kick participants, server-mute (admins)
  - Text: delete any user's messages (MANAGE_MESSAGES permission)
  - Actions available via right-click context menus
- **User profiles** -- customizable display name and avatar (auto-cropped to 256x256 WebP)
- File uploads with drag-and-drop and inline image embeds
- Typing indicators and user presence (online/offline)
- Message editing and deletion
- Desktop notifications
- RNNoise ML noise suppression for voice (WebAssembly AudioWorklet)

## Tech Stack

- **Client:** Electron + React + TypeScript + Zustand
- **Server:** Fastify + Prisma + PostgreSQL + Redis
- **Real-time:** WebSockets (chat) + LiveKit WebRTC (voice/video)
- **Music:** yt-dlp + ffmpeg + @livekit/rtc-node (server-side audio injection)
- **Image processing:** sharp (avatar resize/crop)
- **GIFs:** Klipy API (server-side proxy)

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
- Share the server ID (click "Copy ID" in the channel sidebar header) with others so they can join
- Type in the message input and press Enter to send
- Click the **GIF** button to search and send GIFs inline
- Drag and drop files to upload, or click the `+` button next to the input
- Hover over your own messages to edit or delete them

### Voice / Video / Screen Share
- Click a voice channel in the sidebar
- Click "Join Voice" to connect
- Use the control bar: Mic (toggle mute), Cam (toggle camera), Screen (share screen), Leave
- **Voice persists across navigation** -- switch to text channels while staying in the call
- The sidebar shows your voice connection status with timer, mute toggle, return-to-call, and disconnect buttons
- Right-click any participant to adjust their volume, mute, or (with permissions) kick/server-mute
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

### Roles & Permissions
- Click the gear icon next to the server name to open **Server Settings**
- Create roles with custom names, colors, and permission toggles
- Assign roles to members to grant moderation capabilities
- Server owner automatically has full admin permissions
- Available permissions: Administrator, Manage Server/Channels/Roles/Messages, Kick/Ban Members, Send/Read Messages, Connect to Voice, Speak, Stream

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

## Stopping

```bash
# Stop Docker services
docker compose stop

# Or remove everything (including data)
docker compose down -v
```
