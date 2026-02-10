/**
 * Setup scripts for OpenClaw installation
 * Inspired by ClawControl
 */

async function execOrFail(ssh, command, errorMessage) {
  const result = await ssh.exec(command);
  if (result.code !== 0) {
    throw new Error(`${errorMessage}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

/**
 * Setup 4GB swap file
 */
export async function setupSwap(ssh, onStatus) {
  onStatus?.('Checking swap...');
  
  const check = await ssh.exec('swapon --show');
  if (check.stdout.includes('/swapfile')) {
    onStatus?.('Swap already configured');
    return;
  }

  onStatus?.('Creating 4GB swap file...');
  
  const commands = [
    'fallocate -l 4G /swapfile',
    'chmod 600 /swapfile',
    'mkswap /swapfile',
    'swapon /swapfile',
    "echo '/swapfile none swap sw 0 0' >> /etc/fstab",
    'sysctl vm.swappiness=100',
    "echo 'vm.swappiness=100' >> /etc/sysctl.conf"
  ];

  for (const cmd of commands) {
    await execOrFail(ssh, cmd, 'Failed to setup swap');
  }
}

/**
 * Update system packages
 */
export async function updateSystem(ssh, onStatus) {
  onStatus?.('Updating package lists...');
  await execOrFail(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get update', 'Failed to update');
  
  onStatus?.('Upgrading packages...');
  await execOrFail(ssh, 'DEBIAN_FRONTEND=noninteractive apt-get upgrade -y', 'Failed to upgrade');
  
  onStatus?.('Installing essential packages...');
  await execOrFail(ssh, 
    'DEBIAN_FRONTEND=noninteractive apt-get install -y curl wget git build-essential',
    'Failed to install essentials'
  );
}

/**
 * Install display stack (Xvfb, x11vnc, websockify)
 */
export async function installDisplayStack(ssh, onStatus) {
  onStatus?.('Installing display stack (Xvfb, x11vnc, websockify)...');
  
  await execOrFail(ssh,
    'DEBIAN_FRONTEND=noninteractive apt-get install -y xvfb x11vnc openbox xauth websockify novnc',
    'Failed to install display stack'
  );
}

/**
 * Install cloudflared for tunnels
 */
export async function installCloudflared(ssh, onStatus) {
  onStatus?.('Checking cloudflared...');
  
  const check = await ssh.exec('which cloudflared');
  if (check.code === 0) {
    onStatus?.('cloudflared already installed');
    return;
  }

  onStatus?.('Installing cloudflared...');
  
  // Detect architecture
  const arch = await ssh.exec('dpkg --print-architecture');
  const archStr = arch.stdout.trim(); // amd64 or arm64
  
  await execOrFail(ssh,
    `wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${archStr}.deb -O /tmp/cloudflared.deb`,
    'Failed to download cloudflared'
  );

  await execOrFail(ssh,
    'dpkg -i /tmp/cloudflared.deb',
    'Failed to install cloudflared'
  );
  
  await ssh.exec('rm -f /tmp/cloudflared.deb');
}

/**
 * Install NVM
 */
export async function installNVM(ssh, onStatus) {
  onStatus?.('Checking NVM...');
  
  const check = await ssh.exec('source ~/.nvm/nvm.sh 2>/dev/null && nvm --version');
  if (check.code === 0 && check.stdout.trim()) {
    onStatus?.('NVM already installed');
    return;
  }

  onStatus?.('Installing NVM...');
  await execOrFail(ssh,
    'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash',
    'Failed to install NVM'
  );

  await ssh.exec(`
    if ! grep -q 'NVM_DIR' ~/.bashrc; then
      echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
      echo '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> ~/.bashrc
    fi
  `);
}

/**
 * Install Node.js LTS
 */
export async function installNode(ssh, onStatus) {
  const nvmPrefix = 'source ~/.nvm/nvm.sh &&';
  
  onStatus?.('Checking Node.js...');
  const check = await ssh.exec(`${nvmPrefix} node --version`);
  if (check.code === 0 && check.stdout.includes('v')) {
    onStatus?.('Node.js already installed');
    return;
  }

  onStatus?.('Installing Node.js LTS...');
  await execOrFail(ssh, `${nvmPrefix} nvm install --lts`, 'Failed to install Node.js');
  await execOrFail(ssh, `${nvmPrefix} nvm alias default lts/*`, 'Failed to set default Node.js');
}

/**
 * Install Google Chrome
 */
export async function installChrome(ssh, onStatus) {
  onStatus?.('Checking Chrome...');
  
  const check = await ssh.exec('which google-chrome');
  if (check.code === 0) {
    onStatus?.('Chrome already installed');
    return;
  }

  onStatus?.('Downloading Chrome...');
  await execOrFail(ssh,
    'wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb',
    'Failed to download Chrome'
  );

  onStatus?.('Installing Chrome...');
  await execOrFail(ssh,
    'DEBIAN_FRONTEND=noninteractive apt-get install -y /tmp/chrome.deb',
    'Failed to install Chrome'
  );
  
  await ssh.exec('rm -f /tmp/chrome.deb');
}

/**
 * Install OpenClaw
 */
export async function installOpenClaw(ssh, onStatus) {
  const nvmPrefix = 'source ~/.nvm/nvm.sh &&';
  
  onStatus?.('Checking OpenClaw...');
  const check = await ssh.exec(`${nvmPrefix} openclaw --version`);
  if (check.code === 0 && check.stdout.trim()) {
    onStatus?.('OpenClaw already installed');
    return;
  }

  onStatus?.('Installing OpenClaw...');
  await execOrFail(ssh,
    `${nvmPrefix} curl -fsSL https://openclaw.ai/install.sh | bash`,
    'Failed to install OpenClaw'
  );
}

/**
 * Configure OpenClaw
 */
export async function configureOpenClaw(ssh, config, onStatus) {
  onStatus?.('Configuring OpenClaw...');
  
  await ssh.exec('mkdir -p ~/.openclaw');

  const openclawConfig = {
    browser: {
      enabled: true,
      headless: true,
      noSandbox: true,
      executablePath: '/usr/bin/google-chrome',
      defaultProfile: 'openclaw',
      profiles: {
        openclaw: { cdpPort: 18800 }
      },
      ...config.browser
    },
    gateway: {
      port: 18789,
      mode: 'local',
      bind: 'loopback',
      ...(config.gatewayToken ? { auth: { token: config.gatewayToken } } : {}),
      ...config.gateway
    }
  };

  // Add AI provider config
  if (config.aiProvider && config.aiApiKey) {
    const modelKey = `${config.aiProvider}/${config.model || 'auto'}`;
    openclawConfig.agents = {
      defaults: {
        model: { primary: modelKey }
      }
    };
    openclawConfig.auth = {
      profiles: {
        [`${config.aiProvider}:default`]: {
          provider: config.aiProvider,
          mode: 'api_key'
        }
      }
    };
  }

  // Add Telegram config
  if (config.telegramBotToken) {
    openclawConfig.channels = {
      telegram: {
        enabled: true,
        botToken: config.telegramBotToken,
        ...(config.telegramAllowFrom ? { allowFrom: [config.telegramAllowFrom] } : {})
      }
    };
    openclawConfig.plugins = {
      entries: {
        telegram: { enabled: true }
      }
    };
  }

  const configJson = JSON.stringify(openclawConfig, null, 2);
  await execOrFail(ssh,
    `cat > ~/.openclaw/openclaw.json << 'EOF'\n${configJson}\nEOF`,
    'Failed to write OpenClaw config'
  );
}

/**
 * Write environment file with API key
 */
export async function writeEnvFile(ssh, config, onStatus) {
  if (!config.aiProvider || !config.aiApiKey) return;
  
  onStatus?.('Writing environment file...');
  
  const envVarMap = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    google: 'GOOGLE_API_KEY'
  };
  
  const envVar = envVarMap[config.aiProvider.toLowerCase()] || 
    `${config.aiProvider.toUpperCase()}_API_KEY`;
  
  await ssh.exec('mkdir -p ~/.openclaw');
  await execOrFail(ssh,
    `echo '${envVar}=${config.aiApiKey}' > ~/.openclaw/.env && chmod 600 ~/.openclaw/.env`,
    'Failed to write env file'
  );
}

/**
 * Install Tailscale
 */
export async function installTailscale(ssh, onStatus) {
  onStatus?.('Checking Tailscale...');
  
  const check = await ssh.exec('which tailscale');
  if (check.code === 0) {
    onStatus?.('Tailscale already installed');
    return;
  }

  onStatus?.('Installing Tailscale...');
  await execOrFail(ssh,
    'curl -fsSL https://tailscale.com/install.sh | sh',
    'Failed to install Tailscale'
  );
  
  await ssh.exec('systemctl enable tailscaled');
  await ssh.exec('systemctl start tailscaled');
}

/**
 * Get Tailscale auth URL
 */
export async function getTailscaleAuthUrl(ssh) {
  // Check if already connected
  const status = await ssh.exec('tailscale status --json');
  if (status.code === 0) {
    try {
      const parsed = JSON.parse(status.stdout);
      if (parsed.BackendState === 'Running' && parsed.Self?.Online) {
        return null; // Already authenticated
      }
    } catch {}
  }

  const result = await ssh.exec("timeout 10 tailscale up 2>&1 | grep -oP 'https://[^\\s]+' | head -1");
  if (result.stdout.trim().startsWith('https://')) {
    return result.stdout.trim();
  }
  
  return null;
}

/**
 * Wait for Tailscale authentication
 */
export async function waitForTailscaleAuth(ssh, timeoutMs = 300000) {
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    const status = await ssh.exec('tailscale status --json');
    if (status.code === 0) {
      try {
        const parsed = JSON.parse(status.stdout);
        if (parsed.BackendState === 'Running' && parsed.Self?.Online) {
          return true;
        }
      } catch {}
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  
  throw new Error('Tailscale authentication timeout');
}

/**
 * Configure Tailscale serve
 */
export async function configureTailscaleServe(ssh, onStatus) {
  onStatus?.('Configuring Tailscale serve...');
  
  const ip = await ssh.exec('tailscale ip -4');
  if (ip.code !== 0) throw new Error('Failed to get Tailscale IP');
  
  await execOrFail(ssh, 'tailscale serve --bg 18789', 'Failed to configure Tailscale serve');
  
  return ip.stdout.trim();
}

/**
 * Install and configure CloudClaw runner agent
 */
export async function installRunnerAgent(ssh, onStatus) {
  const nvmPrefix = 'source ~/.nvm/nvm.sh &&';
  
  onStatus?.('Installing CloudClaw runner agent...');
  
  // Create agent directory
  await ssh.exec('mkdir -p /opt/cloudclaw/runner-agent');
  
  // We'll copy the runner agent code here
  // For now, just create a placeholder
  onStatus?.('Runner agent ready for deployment');
}

/**
 * Install systemd service for OpenClaw
 */
export async function installDaemon(ssh, onStatus) {
  const nvmPrefix = 'source ~/.nvm/nvm.sh &&';
  
  onStatus?.('Installing OpenClaw daemon...');
  
  // Get paths
  const whichOC = await ssh.exec(`${nvmPrefix} which openclaw`);
  if (whichOC.code !== 0) throw new Error('OpenClaw not found');
  const openclawBin = whichOC.stdout.trim();
  
  const whichNode = await ssh.exec(`${nvmPrefix} which node`);
  const nodeBin = whichNode.stdout.trim();
  const nodeBinDir = nodeBin.substring(0, nodeBin.lastIndexOf('/'));

  const serviceUnit = `[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
EnvironmentFile=/root/.openclaw/.env
Environment=PATH=${nodeBinDir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/root
Environment=NVM_DIR=/root/.nvm
ExecStart=${openclawBin} gateway --port 18789
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

  await execOrFail(ssh,
    `cat > /etc/systemd/system/openclaw.service << 'EOF'\n${serviceUnit}\nEOF`,
    'Failed to write systemd service'
  );
  
  await execOrFail(ssh, 'systemctl daemon-reload', 'Failed to reload systemd');
  await execOrFail(ssh, 'systemctl enable openclaw', 'Failed to enable OpenClaw');
}

/**
 * Start OpenClaw daemon
 */
export async function startDaemon(ssh, onStatus) {
  onStatus?.('Starting OpenClaw daemon...');
  
  await execOrFail(ssh, 'systemctl start openclaw', 'Failed to start OpenClaw');
  
  // Wait for it to stabilize
  await new Promise(r => setTimeout(r, 3000));
  
  const status = await ssh.exec('systemctl is-active openclaw');
  if (!status.stdout.includes('active')) {
    const logs = await ssh.exec('journalctl -u openclaw -n 20 --no-pager');
    throw new Error(`OpenClaw not running. Logs: ${logs.stdout}`);
  }
}

/**
 * Check if OpenClaw is running
 */
export async function isOpenClawRunning(ssh) {
  const result = await ssh.exec('systemctl is-active openclaw');
  return result.stdout.trim() === 'active';
}

/**
 * Get OpenClaw logs
 */
export async function getOpenClawLogs(ssh, lines = 100) {
  const result = await ssh.exec(`journalctl -u openclaw -n ${lines} --no-pager`);
  return result.stdout;
}
