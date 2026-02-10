import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadDeployment, saveDeployment, deleteSSHKey } from '../services/config.js';
import { createHetznerClient } from '../providers/hetzner.js';
import { createDigitalOceanClient } from '../providers/digitalocean.js';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export async function destroy(name, options) {
  const deployment = loadDeployment(name);
  if (!deployment) {
    console.log(chalk.red(`Deployment "${name}" not found.`));
    return;
  }

  if (!options.force) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to destroy "${name}"? This will delete the server.`,
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.dim('Cancelled.'));
      return;
    }
  }

  const spinner = ora('Destroying deployment...').start();

  try {
    if (deployment.provider === 'hetzner' && deployment.hetzner) {
      const client = createHetznerClient(deployment.hetzner.apiKey);
      
      if (deployment.serverId) {
        spinner.text = 'Deleting server...';
        try {
          await client.deleteServer(deployment.serverId);
        } catch (err) {
          if (!err.message.includes('not found')) throw err;
        }
      }
      
      if (deployment.sshKeyId) {
        spinner.text = 'Deleting SSH key...';
        try {
          await client.deleteSSHKey(deployment.sshKeyId);
        } catch (err) {
          if (!err.message.includes('not found')) throw err;
        }
      }
    } else if (deployment.provider === 'digitalocean' && deployment.digitalocean) {
      const client = createDigitalOceanClient(deployment.digitalocean.apiKey);
      
      if (deployment.serverId) {
        spinner.text = 'Deleting droplet...';
        try {
          await client.deleteDroplet(deployment.serverId);
        } catch (err) {
          if (!err.message.includes('not found')) throw err;
        }
      }
      
      if (deployment.sshKeyId) {
        spinner.text = 'Deleting SSH key...';
        try {
          await client.deleteSSHKey(deployment.sshKeyId);
        } catch (err) {
          if (!err.message.includes('not found')) throw err;
        }
      }
    }

    // Delete local files
    spinner.text = 'Cleaning up local files...';
    
    try {
      deleteSSHKey(name);
    } catch {}
    
    try {
      const deploymentPath = join(homedir(), '.cloudclaw', 'deployments', `${name}.json`);
      unlinkSync(deploymentPath);
    } catch {}

    spinner.succeed(`Deployment "${name}" destroyed`);
  } catch (err) {
    spinner.fail(`Error: ${err.message}`);
  }
}
