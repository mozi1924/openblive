# Overlay / Compatibility WS

## Goals
The compatibility layer is designed for existing scripts/tools that already consume blivechat-like WS payloads.

- Overlay URL: `GET /overlay`
- Chat WebSocket: `GET /api/chat`
- Text emoticon mappings: `GET /api/text_emoticon_mappings`
- Overlay frontend source: `src/overlay-compat/` (rewritten in React + TypeScript)

## Important behavior

### RoomId/AuthCode are accepted but ignored
If client sends old fields in `JOIN_ROOM` (e.g. `roomKey`, `roomId`, auth code related fields), server:

- accepts frame
- does **not** return error
- ignores those values
- binds stream to current OpenBlive logged-in session and internal danmu pipeline

This keeps legacy clients working while removing identity-code workflow.

## `/api/chat` protocol (compatible)
Server emits blivechat-style frames:

- Heartbeat: `cmd = 0`
- Text danmu: `cmd = 2`
- Gift: `cmd = 3`
- Guard/member: `cmd = 4`
- Super Chat: `cmd = 5`
- Super Chat delete: `cmd = 6` (when deletion IDs are available)

Client heartbeat (`cmd = 0`) and join (`cmd = 1`) are supported.
After first `JOIN_ROOM` (`cmd = 1`), server will backfill recent history danmu
from current room via compatible `cmd = 2` frames (no local persistence).

## `/api/text_emoticon_mappings` (compatible)
For blivechat frontend compatibility, server now exposes:

- `GET /api/text_emoticon_mappings`
- Response shape: `{ "textEmoticons": [{ "keyword": "...", "url": "..." }, ...] }`

Current implementation resolves mappings from the current logged-in session's live emoticon list.
If account/room context is unavailable, it safely returns an empty list.

## Overlay page
`/overlay` serves the compiled `blivechat`-compatible frontend (not a custom rewritten template).

- Connects to `/api/chat`
- Uses optional `?token=...`
- Reconnects automatically
- Renders compatible message frames

## Build and integration
- Overlay is built using Vite and integrated into the main panel build workflow.
- Build command: `pnpm build:overlay` (runs automatically during `pnpm build` / `pnpm build:desktop`)
- Output directory: `dist/overlay`
- Runtime static route: `/overlay` + `/overlay/*`

## Scope after extraction
To keep integration lightweight, the embedded overlay keeps only core chat-stream rendering:
- Keeps: `/room` message flow rendering, filtering, merge, emoticon parsing, `/api/chat` compatibility.
- Removed: style generator pages, plugin/admin pages, custom template bridge, pronunciation dictionaries, and unused direct-connection clients.

## URL examples

Local (loopback bypass enabled):
- `http://127.0.0.1:12450/overlay`

Remote / strict token mode:
- `http://YOUR_HOST:12450/overlay?token=YOUR_TOKEN`
- `ws://YOUR_HOST:12450/api/chat?token=YOUR_TOKEN`
