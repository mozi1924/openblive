# OpenBlive External WebSocket API

## Overview
OpenBlive now provides a built-in external service (HTTP + WebSocket) for remote control and chat relay.

- Overlay page: `GET /overlay`
- Compatibility chat WS: `GET /api/chat`
- Native control WS: `GET /ws`

Default listen address is `127.0.0.1:12450`.

## Authentication
When `ws_server_auth_token` is set:

- Non-loopback clients must provide token:
  - Query: `?token=YOUR_TOKEN`
  - Or header: `x-openblive-token: YOUR_TOKEN`
- Loopback clients (`127.0.0.1` / `localhost`) can bypass token when
  `ws_server_bypass_token_for_loopback = true`.

When token is empty, all clients are allowed.

## Native WS (`/ws`)

### Request format
```json
{
  "id": "req-1",
  "action": "live.start",
  "params": {}
}
```

### Response format
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

On connect, server sends:
```json
{
  "event": "ready",
  "data": { "service": "openblive-ws", "version": 1 },
  "at": 1710000000
}
```

### Supported actions
- `live.start`
- `live.stop`
- `danmu.start`
- `danmu.stop`
- `session.get`
- `server.ping`

`session.get` returns current session state from the running OpenBlive instance.

## Config keys
These app config keys control the service:

- `ws_server_enabled: boolean`
- `ws_server_listen_addr: string`
- `ws_server_auth_token: string`
- `ws_server_bypass_token_for_loopback: boolean`
