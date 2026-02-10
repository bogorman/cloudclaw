import chalk from 'chalk';
import ora from 'ora';
import { loadDeployment, loadSSHKey } from '../services/config.js';
import { createSSHConnection } from '../services/ssh.js';
import { isOpenClawRunning } from '../services/setup.js';

export async function status(name) {
  if (!name) {
    console.log(chalk.red('Usage: cloudclaw status <name>'));
    return;
  }

  const deployment = loadDeployment(name);
  if (!deployment) {
    console.log(chalk.red(`Deployment "${name}" not found.`));
    return;
  }

  console.log(chalk.cyan(`\n📊 Status: ${name}\n`));

  const statusColors = {
    created: chalk.yellow,
    deploying: chalk.blue,
    deployed: chalk.green,
    failed: chalk.red
  };
  
  const statusColor = statusColors[deployment.status] || chalk.dim;
  
  console.log(`  ${chalk.dim('Status:')}      ${statusColor(deployment.status)}`);
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
