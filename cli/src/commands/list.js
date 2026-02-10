import chalk from 'chalk';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadDeployment } from '../services/config.js';

const DEPLOYMENTS_DIR = join(homedir(), '.cloudclaw', 'deployments');

export async function list() {
  if (!existsSync(DEPLOYMENTS_DIR)) {
    console.log(chalk.dim('\nNo deployments found. Run `cloudclaw new` to create one.\n'));
    return;
  }

  const files = readdirSync(DEPLOYMENTS_DIR).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    console.log(chalk.dim('\nNo deployments found. Run `cloudclaw new` to create one.\n'));
    return;
  }

  console.log(chalk.cyan('\n📦 Deployments\n'));

  for (const file of files) {
    const name = file.replace('.json', '');
    const deployment = loadDeployment(name);
    
    const statusColors = {
      created: chalk.yellow,
      deploying: chalk.blue,
      deployed: chalk.green,
      failed: chalk.red
    };
    
    const statusColor = statusColors[deployment.status] || chalk.dim;
    const status = statusColor(deployment.status || 'unknown');
    
    console.log(`  ${chalk.bold(name)}`);
    console.log(`    Status: ${status}`);
    console.log(`    Provider: ${deployment.provider}`);
    
    if (deployment.serverIp) {
      console.log(`    IP: ${deployment.serverIp}`);
    }
    if (deployment.tailscaleIp) {
      console.log(`    Tailscale: ${deployment.tailscaleIp}`);
    }
    
    console.log('');
  }
}
