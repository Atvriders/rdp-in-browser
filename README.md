# rdp-in-browser

Real RDP client running entirely in the browser, powered by Apache Guacamole.

[![Build & Publish Docker Images](https://github.com/Atvriders/rdp-in-browser/actions/workflows/docker.yml/badge.svg)](https://github.com/Atvriders/rdp-in-browser/actions/workflows/docker.yml)

## Features

- **Real RDP** — connects to actual Windows/Linux desktops via RDP (FreeRDP under the hood)
- **Dual monitor support** — open two browser windows on separate monitors; drag RDP sessions between them by pushing a window past the screen edge
- **Multiple sessions** — manage multiple connections from a taskbar
- **Draggable & resizable windows** — floating window UI with full 8-direction resize handles
- **Saved connections** — recent connections persisted to localStorage

## Architecture

```
Browser (React)
   └── guacamole-common-js (WebSocket tunnel)
         └── Node.js bridge server (WebSocket → TCP)
               └── guacd (Apache Guacamole daemon, port 4822)
                     └── RDP target machine
```

| Component | Tech |
|-----------|------|
| Frontend | React + TypeScript + Vite, `guacamole-common-js` |
| Server   | Node.js + TypeScript WebSocket → guacd bridge |
| Protocol | Apache Guacamole over TCP + WebSocket |
| Dual-monitor | BroadcastChannel API (cross-window) |

## Quick Start (Docker)

```bash
docker compose up
```

Open `http://localhost:5173` in your browser.

### Pre-built images (GitHub Packages)

Images are published to GitHub Container Registry on every push to `master`:

```
ghcr.io/atvriders/rdp-in-browser-server:master
ghcr.io/atvriders/rdp-in-browser-frontend:master
```

Pull them manually:
```bash
docker pull ghcr.io/atvriders/rdp-in-browser-server:master
docker pull ghcr.io/atvriders/rdp-in-browser-frontend:master
```

## Dual Monitor Setup

1. Open `http://localhost:5173` in two browser windows
2. Move each window to a different physical monitor
3. The taskbar shows **🖥️🖥️ Dual** when the two windows detect each other
4. Drag an RDP session's title bar past the screen edge — it transfers to the other window

The windows automatically re-pair within 2 seconds if you move them between monitors.

## Connecting to a Machine

1. Click **＋ New RDP** in the taskbar
2. Enter hostname/IP, port (default 3389), username, and password
3. Click **Connect**

### Advanced options

| Option | Description |
|--------|-------------|
| Resolution | Custom width × height |
| Color depth | 8 / 16 / 24 / 32-bit |
| Security | any / nla / tls / rdp |
| Ignore cert | Skip TLS certificate validation |

## Requirements

- Docker + Docker Compose
- RDP-enabled target (Windows Remote Desktop, xrdp on Linux, etc.)
- The guacd container must reach the RDP host on port 3389

## Development

```bash
# Start guacd
docker run -d -p 4822:4822 guacamole/guacd

# Server (port 3001)
cd server && npm install && npm run dev

# Frontend (port 5173, proxies /ws → server)
cd frontend && npm install && npm run dev
```
