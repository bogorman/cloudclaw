import chalk from 'chalk';
import { listDeployments, loadDeployment } from '../services/config.js';

export async function list() {
  const deployments = listDeployments();

  if (deployments.length === 0) {
    console.log(chalk.dim('\nNo instances found. Run `cloudclaw new` to create one.\n'));
    return;
  }

  console.log(chalk.cyan('\n🦀 Instances\n'));

  const statusIcons = {
    created: '⚪',
    deploying: '🔵',
    deployed: '🟢',
    failed: '🔴'
  };

  for (const name of deployments) {
    const deployment = loadDeployment(name);
    const status = deployment?.status || 'unknown';
    const icon = statusIcons[status] || '⚫';
    
    // Instance name with status
    console.log(`  ${icon} ${chalk.bold(name)}`);
    
    // Provider and IPs
    const details = [];
    if (deployment.provider) details.push(deployment.provider);
    if (deployment.serverIp) details.push(deployment.serverIp);
    if (deployment.tailscaleIp) details.push(`ts:${deployment.tailscaleIp}`);
    
    if (details.length > 0) {
      console.log(`     ${chalk.dim(details.join(' • '))}`);
    }
    
    // Time info
    if (deployment.deployedAt) {
      const ago = timeAgo(new Date(deployment.deployedAt));
      console.log(`     ${chalk.dim(`deployed ${ago}`)}`);
    } else if (deployment.createdAt) {
      const ago = timeAgo(new Date(deployment.createdAt));
      console.log(`     ${chalk.dim(`created ${ago}`)}`);
    }
    
    console.log('');
  }
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
}
