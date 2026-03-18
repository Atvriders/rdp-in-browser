# rdp-in-browser

Real RDP client running entirely in the browser, powered by Apache Guacamole.

## Features

- **Real RDP** — connects to actual Windows/Linux desktops via RDP protocol (FreeRDP under the hood)
- **Dual monitor support** — open two browser windows on separate monitors; drag RDP sessions between them
- **Multiple sessions** — manage multiple connections from a taskbar
- **Draggable & resizable windows** — floating window UI with full resize handles
- **Saved connections** — remembers recent connections in localStorage

## Architecture

```
Browser (React)
   └── guacamole-common-js (WebSocket tunnel)
         └── Node.js bridge server (WebSocket → TCP)
               └── guacd (Apache Guacamole daemon, port 4822)
                     └── RDP target machine
```

- **Frontend**: React + TypeScript + Vite, `guacamole-common-js` for the Guacamole protocol client
- **Server**: Node.js + TypeScript, bridges WebSocket connections from the browser to the guacd TCP socket
- **guacd**: Official Apache Guacamole daemon (`guacamole/guacd` Docker image) — handles RDP via FreeRDP

## Quick Start

```bash
docker compose up
```

Then open `http://localhost:5173` in your browser.

**Dual monitor:** Open the same URL in a second browser window and move it to your second monitor. The two windows will automatically detect each other and enable cross-window session dragging.

## Connecting to a Machine

1. Click **＋ New RDP** in the taskbar
2. Enter the hostname/IP, port (default 3389), username, and password
3. Click **Connect**

### Advanced options

- **Resolution** — custom width × height
- **Color depth** — 8 / 16 / 24 / 32-bit
- **Security** — any / nla / tls / rdp

## Requirements

- Docker + Docker Compose
- RDP-enabled target machine (Windows Remote Desktop, xrdp on Linux, etc.)
- The guacd container must be able to reach the RDP target on port 3389

## Development

```bash
# Server (port 3001)
cd server && npm install && npm run dev

# Frontend (port 5173, proxies /ws → server)
cd frontend && npm install && npm run dev
```

Requires a running `guacd` instance:
```bash
docker run -d -p 4822:4822 guacamole/guacd
```
