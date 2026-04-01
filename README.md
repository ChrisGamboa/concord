# Concord

Self-hostable Discord alternative built with TypeScript. Supports text channels, voice/video chat (1080p60), screen sharing, and music streaming.

## Tech Stack

- **Client**: Electron + React + TypeScript
- **Server**: Fastify + Prisma + PostgreSQL
- **Real-time**: WebSockets (chat) + LiveKit/WebRTC (voice/video)
- **Music**: yt-dlp + ffmpeg piped into LiveKit voice rooms

## Project Structure

```
packages/
  shared/         # Shared types, WS protocol, API contracts
  server/         # Fastify API + WebSocket handler
  client/         # Electron + React desktop app
  music-service/  # YouTube audio extraction + playback (WIP)
```

## Getting Started

### Prerequisites

- Node.js >= 22
- pnpm
- Docker

### Setup

```bash
# Install dependencies
pnpm install

# Start PostgreSQL + Redis
docker compose up -d

# Push database schema
pnpm --filter @concord/server db:push

# Start the server (port 3001)
pnpm dev:server

# Start the Electron client (separate terminal)
pnpm dev:client
```

### Environment

Server env is at `packages/server/.env`. Defaults work out of the box with the Docker Compose setup.

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @concord/server test
pnpm --filter @concord/shared test
```

## Roadmap

- [x] Text channels with real-time messaging
- [x] JWT authentication
- [x] Server/channel management
- [x] Permission system (bitmask roles)
- [x] Voice chat via LiveKit
- [x] Video chat (1080p60 via VP9)
- [x] Screen sharing (1080p60)
- [x] Music streaming (YouTube search, queue, playback via yt-dlp)
- [x] File uploads (drag-and-drop, inline image embeds)
- [x] Typing indicators
- [x] User presence (online/offline with member list)
- [x] User settings (audio/video device selection)
- [x] Desktop notifications
