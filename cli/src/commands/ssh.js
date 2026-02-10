import { spawn } from 'child_process';
import chalk from 'chalk';
import { join } from 'path';
import { homedir } from 'os';
import { requireInstance } from '../services/resolver.js';

export async function ssh(nameOrId) {
  const { name, deployment } = await requireInstance(nameOrId, 'ssh');

  if (!deployment.serverIp) {
    console.log(chalk.red('No server IP found. Deploy first.'));
    return;
  }

  const keyPath = join(homedir(), '.cloudclaw', 'keys', name);
  
  console.log(chalk.cyan(`\n🔌 Connecting to ${chalk.bold(name)} (${deployment.serverIp})...\n`));

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
