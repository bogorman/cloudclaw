import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import open from 'open';
import { loadDeployment, saveDeployment, saveSSHKey, loadSSHKey } from '../services/config.js';
import { generateSSHKeyPair, createSSHConnection, waitForSSH } from '../services/ssh.js';
import { createHetznerClient } from '../providers/hetzner.js';
import { createDigitalOceanClient } from '../providers/digitalocean.js';
import * as setup from '../services/setup.js';

const CHECKPOINTS = [
  'server_created',
  'ssh_connected',
  'swap_configured',
  'system_updated',
  'display_stack_installed',
  'nvm_installed',
  'node_installed',
  'chrome_installed',
  'openclaw_installed',
  'openclaw_configured',
  'tailscale_installed',
  'tailscale_authenticated',
  'daemon_started',
  'completed'
];

export async function deploy(name) {
  if (!name) {
    console.log(chalk.red('Usage: cloudclaw deploy <name>'));
    return;
  }

  const deployment = loadDeployment(name);
  if (!deployment) {
    console.log(chalk.red(`Deployment "${name}" not found. Run 'cloudclaw new' first.`));
    return;
  }

  console.log(chalk.cyan(`\n🚀 Deploying ${name}...\n`));

  const spinner = ora();
  let ssh = null;

  try {
    // Find starting point
    const completedCheckpoints = deployment.checkpoints || [];
    const startIndex = completedCheckpoints.length > 0 
      ? CHECKPOINTS.indexOf(completedCheckpoints[completedCheckpoints.length - 1]) + 1
      : 0;

    // === SERVER CREATION ===
    if (startIndex <= CHECKPOINTS.indexOf('server_created')) {
      spinner.start('Creating server...');
      
      if (deployment.provider === 'hetzner') {
        await createHetznerServer(deployment, spinner);
      } else if (deployment.provider === 'digitalocean') {
        await createDigitalOceanServer(deployment, spinner);
      }
      
      markCheckpoint(deployment, 'server_created');
      spinner.succeed(`Server created: ${deployment.serverIp}`);
    }

    // === SSH CONNECTION ===
    if (startIndex <= CHECKPOINTS.indexOf('ssh_connected')) {
      spinner.start('Waiting for SSH...');
      
      const keys = loadSSHKey(name);
      await waitForSSH(deployment.serverIp, keys.privateKey);
      
      ssh = createSSHConnection(deployment.serverIp, keys.privateKey);
      await ssh.connect();
      
      markCheckpoint(deployment, 'ssh_connected');
      spinner.succeed('SSH connected');
    } else {
      // Reconnect SSH for resumed deployments
      const keys = loadSSHKey(name);
      ssh = createSSHConnection(deployment.serverIp, keys.privateKey);
      await ssh.connect();
    }

    // === SWAP ===
    if (startIndex <= CHECKPOINTS.indexOf('swap_configured')) {
      spinner.start('Configuring swap...');
      await setup.setupSwap(ssh, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'swap_configured');
      spinner.succeed('Swap configured');
    }

    // === SYSTEM UPDATE ===
    if (startIndex <= CHECKPOINTS.indexOf('system_updated')) {
      spinner.start('Updating system...');
      await setup.updateSystem(ssh, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'system_updated');
      spinner.succeed('System updated');
    }

    // === DISPLAY STACK ===
    if (startIndex <= CHECKPOINTS.indexOf('display_stack_installed')) {
      spinner.start('Installing display stack...');
      await setup.installDisplayStack(ssh, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'display_stack_installed');
      spinner.succeed('Display stack installed (Xvfb, x11vnc, websockify)');
    }

    // === NVM ===
    if (startIndex <= CHECKPOINTS.indexOf('nvm_installed')) {
      spinner.start('Installing NVM...');
      await setup.installNVM(ssh, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'nvm_installed');
      spinner.succeed('NVM installed');
    }

    // === NODE.JS ===
    if (startIndex <= CHECKPOINTS.indexOf('node_installed')) {
      spinner.start('Installing Node.js...');
      await setup.installNode(ssh, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'node_installed');
      spinner.succeed('Node.js installed');
    }

    // === CHROME ===
    if (startIndex <= CHECKPOINTS.indexOf('chrome_installed')) {
      spinner.start('Installing Chrome...');
      await setup.installChrome(ssh, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'chrome_installed');
      spinner.succeed('Chrome installed');
    }

    // === OPENCLAW ===
    if (startIndex <= CHECKPOINTS.indexOf('openclaw_installed')) {
      spinner.start('Installing OpenClaw...');
      await setup.installOpenClaw(ssh, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'openclaw_installed');
      spinner.succeed('OpenClaw installed');
    }

    // === CONFIGURE OPENCLAW ===
    if (startIndex <= CHECKPOINTS.indexOf('openclaw_configured')) {
      spinner.start('Configuring OpenClaw...');
      await setup.configureOpenClaw(ssh, deployment, (msg) => { spinner.text = msg; });
      await setup.writeEnvFile(ssh, deployment, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'openclaw_configured');
      spinner.succeed('OpenClaw configured');
    }

    // === TAILSCALE ===
    if (deployment.useTailscale) {
      if (startIndex <= CHECKPOINTS.indexOf('tailscale_installed')) {
        spinner.start('Installing Tailscale...');
        await setup.installTailscale(ssh, (msg) => { spinner.text = msg; });
        markCheckpoint(deployment, 'tailscale_installed');
        spinner.succeed('Tailscale installed');
      }

      if (startIndex <= CHECKPOINTS.indexOf('tailscale_authenticated')) {
        spinner.start('Getting Tailscale auth URL...');
        const authUrl = await setup.getTailscaleAuthUrl(ssh);
        
        if (authUrl) {
          spinner.stop();
          console.log(chalk.yellow(`\n🔗 Authenticate Tailscale:`));
          console.log(chalk.cyan(authUrl));
          
          const { openBrowser } = await inquirer.prompt([{
            type: 'confirm',
            name: 'openBrowser',
            message: 'Open browser?',
            default: true
          }]);
          
          if (openBrowser) {
            await open(authUrl);
          }
          
          spinner.start('Waiting for Tailscale authentication...');
          await setup.waitForTailscaleAuth(ssh);
        }
        
        const tailscaleIp = await setup.configureTailscaleServe(ssh, (msg) => { spinner.text = msg; });
        deployment.tailscaleIp = tailscaleIp;
        
        markCheckpoint(deployment, 'tailscale_authenticated');
        spinner.succeed(`Tailscale configured: ${tailscaleIp}`);
      }
    } else {
      // Skip tailscale checkpoints
      if (startIndex <= CHECKPOINTS.indexOf('tailscale_installed')) {
        markCheckpoint(deployment, 'tailscale_installed');
      }
      if (startIndex <= CHECKPOINTS.indexOf('tailscale_authenticated')) {
        markCheckpoint(deployment, 'tailscale_authenticated');
      }
    }

    // === DAEMON ===
    if (startIndex <= CHECKPOINTS.indexOf('daemon_started')) {
      spinner.start('Installing OpenClaw daemon...');
      await setup.installDaemon(ssh, (msg) => { spinner.text = msg; });
      await setup.startDaemon(ssh, (msg) => { spinner.text = msg; });
      markCheckpoint(deployment, 'daemon_started');
      spinner.succeed('OpenClaw daemon started');
    }

    // === COMPLETE ===
    markCheckpoint(deployment, 'completed');
    deployment.status = 'deployed';
    deployment.deployedAt = new Date().toISOString();
    saveDeployment(name, deployment);

    ssh.disconnect();

    console.log(chalk.green(`\n✅ Deployment complete!`));
    console.log(chalk.dim(`\nServer IP: ${deployment.serverIp}`));
    if (deployment.tailscaleIp) {
      console.log(chalk.dim(`Tailscale IP: ${deployment.tailscaleIp}`));
    }
    console.log(chalk.dim(`Dashboard: http://${deployment.tailscaleIp || deployment.serverIp}:18789/?token=${deployment.gatewayToken}`));
    console.log(chalk.dim(`\nRun ${chalk.cyan(`cloudclaw dashboard ${name}`)} to open the dashboard.`));

  } catch (err) {
    spinner.fail(err.message);
    deployment.status = 'failed';
    deployment.lastError = err.message;
    saveDeployment(name, deployment);
    
    if (ssh?.isConnected()) {
      ssh.disconnect();
    }
    
    console.log(chalk.yellow(`\nDeployment can be resumed with: cloudclaw deploy ${name}`));
  }
}

function markCheckpoint(deployment, checkpoint) {
  if (!deployment.checkpoints) deployment.checkpoints = [];
  if (!deployment.checkpoints.includes(checkpoint)) {
    deployment.checkpoints.push(checkpoint);
  }
  saveDeployment(deployment.name, deployment);
}

async function createHetznerServer(deployment, spinner) {
  const client = createHetznerClient(deployment.hetzner.apiKey);
  const sshKeyName = `cloudclaw-${deployment.name}`;

  // Generate SSH key
  spinner.text = 'Generating SSH key...';
  const keyPair = generateSSHKeyPair(sshKeyName);
  saveSSHKey(deployment.name, keyPair.privateKey, keyPair.publicKey);

  // Clean up existing key
  const existingKeys = await client.listSSHKeys();
  const existing = existingKeys.find(k => k.name === sshKeyName);
  if (existing) {
    await client.deleteSSHKey(existing.id);
  }

  // Upload SSH key
  spinner.text = 'Uploading SSH key...';
  const sshKey = await client.createSSHKey(sshKeyName, keyPair.publicKey);
  deployment.sshKeyId = sshKey.id;

  // Clean up existing server
  const existingServers = await client.listServers();
  const existingServer = existingServers.find(s => s.name === deployment.name);
  if (existingServer) {
    spinner.text = 'Removing existing server...';
    await client.deleteServer(existingServer.id);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Create server
  spinner.text = 'Creating server...';
  const result = await client.createServer({
    name: deployment.name,
    server_type: deployment.hetzner.serverType,
    image: deployment.hetzner.image,
    location: deployment.hetzner.location,
    ssh_keys: [sshKey.id],
    start_after_create: true
  });

  deployment.serverId = result.server.id;

  // Wait for running
  spinner.text = 'Waiting for server to start...';
  const server = await client.waitForServerRunning(result.server.id);
  deployment.serverIp = server.public_net.ipv4.ip;

  saveDeployment(deployment.name, deployment);
}

async function createDigitalOceanServer(deployment, spinner) {
  const client = createDigitalOceanClient(deployment.digitalocean.apiKey);
  const sshKeyName = `cloudclaw-${deployment.name}`;

  // Generate SSH key
  spinner.text = 'Generating SSH key...';
  const keyPair = generateSSHKeyPair(sshKeyName);
  saveSSHKey(deployment.name, keyPair.privateKey, keyPair.publicKey);

  // Clean up existing key
  const existingKeys = await client.listSSHKeys();
  const existing = existingKeys.find(k => k.name === sshKeyName);
  if (existing) {
    await client.deleteSSHKey(existing.id);
  }

  // Upload SSH key
  spinner.text = 'Uploading SSH key...';
  const sshKey = await client.createSSHKey(sshKeyName, keyPair.publicKey);
  deployment.sshKeyId = sshKey.id;

  // Clean up existing droplet
  const existingDroplets = await client.listDroplets();
  const existingDroplet = existingDroplets.find(d => d.name === deployment.name);
  if (existingDroplet) {
    spinner.text = 'Removing existing droplet...';
    await client.deleteDroplet(existingDroplet.id);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Create droplet
  spinner.text = 'Creating droplet...';
  const result = await client.createDroplet({
    name: deployment.name,
    size: deployment.digitalocean.size,
    image: deployment.digitalocean.image,
    region: deployment.digitalocean.region,
    ssh_keys: [sshKey.id]
  });

  deployment.serverId = result.droplet.id;

  // Wait for active
  spinner.text = 'Waiting for droplet to become active...';
  const droplet = await client.waitForDropletActive(result.droplet.id);
  const publicIp = droplet.networks.v4.find(n => n.type === 'public')?.ip_address;
  deployment.serverIp = publicIp;

  saveDeployment(deployment.name, deployment);
}
