# CloudClaw

Open source gateway to deploy and manage OpenClaw in the cloud with human-in-the-loop browser sessions via noVNC.

## Screenshots

### Dashboard
Create and manage browser sessions from the web dashboard:

![CloudClaw Dashboard](docs/images/dashboard.png)

### noVNC Viewer
Control Chrome remotely through the browser:

![CloudClaw Viewer with Chrome](docs/images/viewer-chrome.png)

## What is CloudClaw?

CloudClaw combines:
- **VPS Provisioning**: Deploy to Hetzner or DigitalOcean with one command
- **Full Stack Setup**: Node.js, Chrome, OpenClaw, Tailscale — all automated
- **Visual Browser Sessions**: View and control Chrome via noVNC when needed
- **Human-in-the-Loop**: When Playwright hits a login page, users can manually authenticate

```
┌─────────────────┐     HTTPS      ┌─────────────────┐    Private    ┌─────────────────┐
│     Browser     │◄──────────────►│  Middle Server  │◄─────────────►│     Runner      │
│   (noVNC UI)    │                │   (Dashboard)   │               │  (Agent + VNC)  │
└─────────────────┘                └─────────────────┘               └─────────────────┘
```

## Quick Start

### Install CLI

```bash
npm install -g cloudclaw
```

### Deploy

```bash
# Create a new deployment
cloudclaw new

# Deploy to cloud
cloudclaw deploy my-agent

# Open dashboard
cloudclaw dashboard my-agent

# SSH into server
cloudclaw ssh my-agent

# View logs
cloudclaw logs my-agent -f

# Destroy deployment
cloudclaw destroy my-agent
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `cloudclaw new` | Create a new deployment configuration |
| `cloudclaw deploy <name>` | Deploy OpenClaw to a VPS |
| `cloudclaw status <name>` | Show deployment status |
| `cloudclaw list` | List all deployments |
| `cloudclaw ssh <name>` | SSH into a deployment |
| `cloudclaw logs <name>` | View OpenClaw logs |
| `cloudclaw dashboard <name>` | Open the OpenClaw dashboard |
| `cloudclaw destroy <name>` | Destroy a deployment |

## What Gets Installed

On each VPS, CloudClaw installs:
- 4GB swap (for low-memory servers)
- Node.js LTS (via NVM)
- Google Chrome
- OpenClaw
- Display stack: Xvfb, x11vnc, websockify, noVNC
- Tailscale (optional, for secure remote access)
- systemd service for OpenClaw

## Cloud Providers

### Hetzner Cloud
- Cheapest: CPX11 (2 vCPU, 2GB RAM) at €4.35/mo
- US locations: Ashburn, Hillsboro
- EU locations: Falkenstein, Nuremberg, Helsinki

### DigitalOcean
- Smallest: s-1vcpu-2gb (1 vCPU, 2GB RAM) at $12/mo
- Regions: NYC, SFO, AMS, LON, FRA, SGP

## Architecture

### Runner Agent
Runs on each VPS. Manages interactive browser sessions:
- Creates on-demand display sessions (Xvfb + Chrome + x11vnc)
- Exposes private HTTP API for session management
- Auto-cleanup on TTL expiry

### Middle Server (Dashboard)
Public-facing gateway:
- Authenticates users
- Manages session registry
- Proxies WebSocket connections to runners
- Serves noVNC viewer

## Security

- VNC/WebSocket ports bind only to private interface
- Firewall allows only dashboard to connect to runner
- Dashboard is the only public entrypoint (HTTPS)
- Per-session access control (owner only)
- Sessions auto-expire after TTL (default 15 minutes)
- Tailscale for secure remote access (optional)

## Development

```bash
# Clone repo
git clone https://github.com/buddybot89/cloudclaw
cd cloudclaw

# Install CLI dependencies
cd cli && npm install

# Run CLI locally
node bin/cloudclaw.js new

# Run runner agent (on Ubuntu)
cd runner-agent && npm install && npm start

# Run dashboard
cd middle-server && npm install && npm start
```

## License

MIT

## Credits

Inspired by [ClawControl](https://github.com/ipenywis/clawcontrol) by Islem.
