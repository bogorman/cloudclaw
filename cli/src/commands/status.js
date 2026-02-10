import chalk from 'chalk';
import ora from 'ora';
import { loadSSHKey } from '../services/config.js';
import { createSSHConnection } from '../services/ssh.js';
import { isOpenClawRunning } from '../services/setup.js';
import { requireInstance } from '../services/resolver.js';

export async function status(nameOrId) {
  const { name, deployment } = await requireInstance(nameOrId, 'status');

  console.log(chalk.cyan(`\n🦀 ${chalk.bold(name)}\n`));

  const statusColors = {
    created: chalk.yellow,
    deploying: chalk.blue,
    deployed: chalk.green,
    failed: chalk.red
  };
  
  const statusIcons = {
    created: '⚪',
    deploying: '🔵',
    deployed: '🟢',
    failed: '🔴'
  };
  
  const statusIcon = statusIcons[deployment.status] || '⚫';
  const statusColor = statusColors[deployment.status] || chalk.dim;
  
  console.log(`  ${chalk.dim('Status:')}      ${statusIcon} ${statusColor(deployment.status)}`);
  console.log(`  ${chalk.dim('Provider:')}    ${deployment.provider}`);
  
  if (deployment.serverIp) {
    console.log(`  ${chalk.dim('Server IP:')}   ${deployment.serverIp}`);
  }
  if (deployment.tailscaleIp) {
    console.log(`  ${chalk.dim('Tailscale:')}   ${deployment.tailscaleIp}`);
  }
  if (deployment.createdAt) {
    console.log(`  ${chalk.dim('Created:')}     ${new Date(deployment.createdAt).toLocaleString()}`);
  }
  if (deployment.deployedAt) {
    console.log(`  ${chalk.dim('Deployed:')}    ${new Date(deployment.deployedAt).toLocaleString()}`);
  }

  // Check checkpoints
  if (deployment.checkpoints?.length > 0) {
    console.log(`\n  ${chalk.dim('Checkpoints:')}`);
    for (const cp of deployment.checkpoints) {
      console.log(`    ${chalk.green('✓')} ${cp}`);
    }
  }

  // Check if OpenClaw is running
  if (deployment.status === 'deployed' && deployment.serverIp) {
    const spinner = ora('Checking OpenClaw status...').start();
    
    try {
      const keys = loadSSHKey(name);
      const ssh = createSSHConnection(deployment.serverIp, keys.privateKey);
      await ssh.connect();
      
      const running = await isOpenClawRunning(ssh);
      ssh.disconnect();
      
      if (running) {
        spinner.succeed('OpenClaw is running');
        
        const dashboardUrl = `http://${deployment.tailscaleIp || deployment.serverIp}:18789/?token=${deployment.gatewayToken}`;
        console.log(`\n  ${chalk.dim('Dashboard:')} ${chalk.cyan(dashboardUrl)}`);
      } else {
        spinner.warn('OpenClaw daemon is not running');
      }
    } catch (err) {
      spinner.fail(`Could not connect: ${err.message}`);
    }
  }

  console.log('');
}
