import { spawn } from 'child_process';
import chalk from 'chalk';
import { loadDeployment, loadSSHKey } from '../services/config.js';
import { join } from 'path';
import { homedir } from 'os';

export async function ssh(name) {
  const deployment = loadDeployment(name);
  if (!deployment) {
    console.log(chalk.red(`Deployment "${name}" not found.`));
    return;
  }

  if (!deployment.serverIp) {
    console.log(chalk.red('No server IP found. Deploy first.'));
    return;
  }

  const keyPath = join(homedir(), '.cloudclaw', 'keys', name);
  
  console.log(chalk.cyan(`\n🔌 Connecting to ${name} (${deployment.serverIp})...\n`));

  const sshProcess = spawn('ssh', [
    '-i', keyPath,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    `root@${deployment.serverIp}`
  ], {
    stdio: 'inherit'
  });

  sshProcess.on('close', (code) => {
    process.exit(code);
  });
}
