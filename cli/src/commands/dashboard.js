import chalk from 'chalk';
import open from 'open';
import { requireInstance } from '../services/resolver.js';

export async function dashboard(nameOrId) {
  const { name, deployment } = await requireInstance(nameOrId, 'dashboard');

  if (deployment.status !== 'deployed') {
    console.log(chalk.red(`Instance "${name}" is not deployed yet.`));
    return;
  }

  const ip = deployment.tailscaleIp || deployment.serverIp;
  if (!ip) {
    console.log(chalk.red('No IP address found.'));
    return;
  }

  const url = `http://${ip}:18789/?token=${deployment.gatewayToken}`;
  
  console.log(chalk.cyan(`\n🖥️  Opening dashboard for ${chalk.bold(name)}...\n`));
  console.log(`  ${chalk.dim('URL:')} ${url}\n`);

  await open(url);
}
