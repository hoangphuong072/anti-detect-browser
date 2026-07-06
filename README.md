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

## Docker Compose / Coolify

The compose setup runs the manager inside a container and mounts the host Docker socket so it can create one Camoufox container per browser.

```bash
docker compose up -d --build
```

For Coolify, deploy this repository as a Docker Compose project and keep these settings:

- Expose app port `3000`.
- Mount `/var/run/docker.sock:/var/run/docker.sock`.
- Keep the persistent volume `adb-data:/app/data`.
- Allow direct DevTools ports `60080-60180` on the server firewall if Hermes connects directly to browsers.

On startup the manager container builds `camoufox-vnc:latest` from `runtime/camoufox-vnc` into the host Docker daemon if the image does not already exist. Set `ADB_BUILD_RUNTIME_IMAGE=0` only if you build/push `CAMOUFOX_IMAGE` yourself.

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
- WebDriver BiDi DevTools is exposed directly on `0.0.0.0` using `noVncPort + 1000`, for example `60080`.
- The dashboard itself has no auth in v1. Bind it to `127.0.0.1` for local-only use or `0.0.0.0` for LAN/tailnet/Coolify.

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
