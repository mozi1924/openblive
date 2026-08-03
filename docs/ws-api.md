# OpenBlive External Service API

## Overview
OpenBlive provides a built-in external service (HTTP + WebSocket) for remote control, chat relay, and overlay rendering.

| Route | Protocol | Description |
| --- | --- | --- |
| `GET /overlay` | HTTP | Embedded blivechat-compatible Overlay SPA index |
| `GET /overlay/*` | HTTP | Overlay SPA static assets |
| `GET /api/chat` | WebSocket | Compatible chat WebSocket (blivechat frame format) |
| `GET /api/text_emoticon_mappings` | HTTP | Resolves current session text emoticon mappings JSON |
| `GET /ws` | WebSocket | Native control & event stream WebSocket |

Default listen address is `127.0.0.1:12450`.

## Authentication
When `ws_server_auth_token` is set in configuration:

- Non-loopback clients must supply the auth token:
  - Query parameter: `?token=YOUR_TOKEN`
  - Or HTTP Header: `x-openblive-token: YOUR_TOKEN`
- Loopback clients (`127.0.0.1` / `localhost` / `::1`) can bypass token verification when `ws_server_bypass_token_for_loopback = true`.

When `ws_server_auth_token` is empty, all client connections are allowed.

---

## Compatibility Chat WS (`/api/chat`)

Designed for existing scripts, tools, and overlay clients expecting blivechat WS frames.

### Incoming Frames (Client -> Server)
- **Heartbeat (`cmd = 0`)**: `{"cmd": 0}`
- **Join Room (`cmd = 1`)**: `{"cmd": 1, "data": { "roomId": 123456 }}`
  - *Note*: `roomId`, `roomKey`, and auth codes are accepted for compatibility but ignored. The stream is automatically bound to the active OpenBlive logged-in session.
  - Upon receiving the first `JOIN_ROOM` (`cmd = 1`), server backfills recent danmu history for the connection.

### Outgoing Frames (Server -> Client)
- **Heartbeat (`cmd = 0`)**: `{"cmd": 0, "data": {}}` emitted periodically.
- **Text Message (`cmd = 2`)**: `{"cmd": 2, "data": [...]}`
  - Data payload array indices: `[avatar, timestamp, authorName, authorType, content, privilegeType, isGift, isTmpMsg, isRepeat, isAutoTranslate, isYtSticker, id, translation, contentType, contentTypeParams, isSuperChat, uid, medalName, medalLevel]`
- **Gift Message (`cmd = 3`)**: `{"cmd": 3, "data": { ... }}`
- **Guard / Member (`cmd = 4`)**: `{"cmd": 4, "data": { ... }}`
- **Super Chat (`cmd = 5`)**: `{"cmd": 5, "data": { ... }}`
- **Delete / Recall (`cmd = 6`)**: `{"cmd": 6, "data": { "ids": ["msg_id_1", ...] }}`

---

## Text Emoticon Mappings (`/api/text_emoticon_mappings`)

- **Method**: `GET /api/text_emoticon_mappings`
- **Response Format**:
```json
{
  "textEmoticons": [
    { "keyword": "[doge]", "url": "https://..." }
  ]
}
```
Resolves custom/room text emoticon mappings from the active session. Returns `{ "textEmoticons": [] }` if context is unavailable.

---

## Native WS (`/ws`)

### Request format (Client -> Server)
```json
{
  "id": "req-1",
  "action": "live.start",
  "params": {}
}
```

### Response format (Server -> Client)
Success:
```json
{
  "id": "req-1",
  "ok": true,
  "result": { "code": 0, "msg": "ok", "data": {} }
}
```

Failure:
```json
{
  "id": "req-1",
  "ok": false,
  "error": {
    "code": "ACTION_FAILED",
    "message": "..."
  }
}
```

### Server push events
```json
{
  "event": "danmu.message",
  "data": { "type": "danmu", "sender": "...", "content": "..." },
  "at": 1710000000
}
```

On connection, server sends:
```json
{
  "event": "ready",
  "data": { "service": "openblive-ws", "version": 1 },
  "at": 1710000000
}
```

On connection, server also pushes initial recent danmu history:
```json
{
  "event": "danmu.recent",
  "data": { "messages": [...] },
  "at": 1710000000
}
```

### Supported actions
- `live.start`: Starts live flow (`start_live_flow_inner`)
- `live.stop`: Stops live flow (`stop_live_flow_inner`)
- `danmu.start`: Starts danmu monitor (`start_danmu_monitor_for_ws`)
- `danmu.stop`: Stops danmu monitor (`stop_danmu_monitor_for_ws`)
- `danmu.recent`: Fetches recent danmu messages
- `session.get`: Returns current session state & status
- `server.ping`: Returns `{ "pong": true, "at": <timestamp> }`

---

## Configuration Keys
These app config keys control the service:

- `ws_server_enabled: boolean`
- `ws_server_listen_addr: string`
- `ws_server_auth_token: string`
- `ws_server_bypass_token_for_loopback: boolean`
