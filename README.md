# Antidetect Browser Manager

Local dashboard for managing Camoufox browsers, with one Docker container per browser, noVNC remote control, persistent profiles, and per-browser proxy assignment.

## Requirements

- Node.js 24+
- Docker Engine with local socket access
- `curl` on the host for proxy testing

## Setup

```bash
npm install
npm run docker:build-runtime
cp .env.example .env
npm run build
npm start
```

Open http://127.0.0.1:3000.

For development:

```bash
npm run dev
```

The Vite dev server runs on http://127.0.0.1:5173 and proxies API/noVNC requests to the backend.

## Runtime Model

- The backend stores browser metadata in SQLite under `data/adb.sqlite`.
- Containers are named `adb-browser-{id}` and labeled with `adb.manager=true`.
- Persistent browsers get a Docker volume named `adb-profile-{id}` mounted at `/home/camoufox/profile`.
- noVNC is exposed only on `127.0.0.1` using an allocated port from `NOVNC_PORT_START` to `NOVNC_PORT_END`.
- The dashboard itself has no auth in v1 and binds to `127.0.0.1` by default.

## API

- `GET /api/browsers`
- `POST /api/browsers`
- `GET /api/browsers/:id`
- `POST /api/browsers/:id/start`
- `POST /api/browsers/:id/stop`
- `DELETE /api/browsers/:id?deleteVolume=true|false`
- `POST /api/browsers/:id/proxy`
- `POST /api/browsers/:id/proxy/test`
- `GET /api/browsers/:id/remote`

Create payload:

```json
{
  "name": "profile-1",
  "persistentProfile": true,
  "startupUrl": "https://example.com",
  "proxy": {
    "scheme": "socks5",
    "host": "127.0.0.1",
    "port": 1080,
    "username": "user",
    "password": "secret"
  }
}
```

## Notes

The runtime image uses `camoufox-js` and downloads the Camoufox browser during Docker build. If upstream Camoufox changes package APIs, update `runtime/camoufox-vnc/start.js` first.
