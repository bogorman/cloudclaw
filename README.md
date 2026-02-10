# CloudClaw

Open source gateway to run OpenClaw in the cloud with human-in-the-loop browser sessions.

## Overview

CloudClaw enables visual browser automation via OpenClaw. When interactive login is required, users can view and control Chrome directly from the dashboard via noVNC.

```
┌─────────────────┐     HTTPS      ┌─────────────────┐    Private    ┌─────────────────┐
│     Browser     │◄──────────────►│  Middle Server  │◄─────────────►│     Runner      │
│   (noVNC UI)    │                │   (Dashboard)   │               │  (Agent + VNC)  │
└─────────────────┘                └─────────────────┘               └─────────────────┘
```

## Features

- **Visual Browser Sessions**: View and control Chrome via noVNC in your browser
- **Human-in-the-Loop**: When Playwright hits a login page, users can manually authenticate
- **Secure by Design**: Runner never exposed to internet; all traffic tunneled through authenticated WebSocket proxy
- **Session Management**: TTL-based sessions with auto-cleanup
- **Docker Ready**: Full Docker image with OpenClaw + all dependencies

## Components

### Runner Agent
Long-running service on each VM that:
- Runs Playwright tasks headless by default
- Creates on-demand interactive sessions (Xvfb + Chrome + x11vnc)
- Exposes private HTTP API for session management

### Middle Server (Dashboard)
Public-facing gateway that:
- Authenticates users
- Manages session registry
- Proxies WebSocket connections to runners
- Serves noVNC viewer

## Quick Start

```bash
# Start the middle server (dashboard)
cd middle-server
npm install
npm start

# On each runner VM
cd runner-agent
npm install
npm start
```

## Requirements

### Runner
- Ubuntu 24.04 LTS
- xvfb, openbox, x11vnc, websockify, xauth
- Node.js 20+
- Playwright dependencies

### Middle Server
- Ubuntu 24.04 LTS (or any OS with Node.js)
- Node.js 20+

## Security

1. Runner VNC/WS ports bind only to private interface
2. Firewall allows only middle server IP to connect to runner
3. Middle server is the only public entrypoint (HTTPS)
4. Per-session access control (owner only)
5. Sessions auto-expire after TTL (default 15 minutes)

## License

MIT
