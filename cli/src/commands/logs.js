import chalk from 'chalk';
import { loadDeployment, loadSSHKey } from '../services/config.js';
import { createSSHConnection } from '../services/ssh.js';
import { getOpenClawLogs } from '../services/setup.js';

export async function logs(name, options) {
  const deployment = loadDeployment(name);
  if (!deployment) {
    console.log(chalk.red(`Deployment "${name}" not found.`));
    return;
  }

  if (!deployment.serverIp) {
    console.log(chalk.red('No server IP found. Deploy first.'));
    return;
  }

  try {
    const keys = loadSSHKey(name);
    const ssh = createSSHConnection(deployment.serverIp, keys.privateKey);
    await ssh.connect();

    if (options.follow) {
      // Follow mode - use journalctl -f
      console.log(chalk.cyan(`\n📜 Following logs for ${name}... (Ctrl+C to stop)\n`));
      
      const { spawn } = await import('child_process');
      const { join } = await import('path');
      const { homedir } = await import('os');
      
      const keyPath = join(homedir(), '.cloudclaw', 'keys', name);
      
      const sshProcess = spawn('ssh', [
        '-i', keyPath,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        `root@${deployment.serverIp}`,
        'journalctl', '-u', 'openclaw', '-f', '--no-pager'
      ], {
        stdio: 'inherit'
      });

      sshProcess.on('close', () => {
        process.exit(0);
      });
    } else {
      console.log(chalk.cyan(`\n📜 Logs for ${name}\n`));
      
      const logs = await getOpenClawLogs(ssh, parseInt(options.lines) || 50);
      console.log(logs);
      
      ssh.disconnect();
    }
  } catch (err) {
    console.log(chalk.red(`Error: ${err.message}`));
  }
}
