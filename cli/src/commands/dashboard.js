import chalk from 'chalk';
import open from 'open';
import { loadDeployment } from '../services/config.js';

export async function dashboard(name) {
  const deployment = loadDeployment(name);
  if (!deployment) {
    console.log(chalk.red(`Deployment "${name}" not found.`));
    return;
  }

  if (deployment.status !== 'deployed') {
    console.log(chalk.red('Deployment is not running. Deploy first.'));
    return;
  }

  const host = deployment.tailscaleIp || deployment.serverIp;
  const url = `http://${host}:18789/?token=${deployment.gatewayToken}`;

  console.log(chalk.cyan(`\n🌐 Opening dashboard for ${name}...\n`));
  console.log(chalk.dim(`URL: ${url}\n`));

  await open(url);
}
