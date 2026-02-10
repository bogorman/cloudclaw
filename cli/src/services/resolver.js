import chalk from 'chalk';
import inquirer from 'inquirer';
import { listDeployments, loadDeployment } from './config.js';

/**
 * Resolve an instance by name, partial name, or interactively
 * @param {string|undefined} nameOrId - Name, partial name, or undefined for picker
 * @param {object} options - Options
 * @param {boolean} options.allowNone - If true, return null when no instances (don't error)
 * @returns {Promise<{name: string, deployment: object}|null>}
 */
export async function resolveInstance(nameOrId, options = {}) {
  const deployments = listDeployments();
  
  if (deployments.length === 0) {
    if (options.allowNone) return null;
    console.log(chalk.dim('\nNo instances found. Run `cloudclaw new` to create one.\n'));
    return null;
  }
  
  // If name provided, try exact match first
  if (nameOrId) {
    // Exact match
    if (deployments.includes(nameOrId)) {
      return { name: nameOrId, deployment: loadDeployment(nameOrId) };
    }
    
    // Partial/fuzzy match (contains search)
    const matches = deployments.filter(d => 
      d.toLowerCase().includes(nameOrId.toLowerCase())
    );
    
    if (matches.length === 1) {
      const name = matches[0];
      return { name, deployment: loadDeployment(name) };
    }
    
    if (matches.length > 1) {
      // Multiple matches - let user pick
      console.log(chalk.yellow(`\nMultiple instances match "${nameOrId}":\n`));
      return await pickFromList(matches);
    }
    
    // No match
    console.log(chalk.red(`\nInstance "${nameOrId}" not found.`));
    console.log(chalk.dim('Available instances:'));
    deployments.forEach(d => console.log(chalk.dim(`  - ${d}`)));
    console.log('');
    return null;
  }
  
  // No name provided - pick interactively
  if (deployments.length === 1) {
    // Only one instance - use it
    const name = deployments[0];
    return { name, deployment: loadDeployment(name) };
  }
  
  // Multiple instances - prompt
  console.log(chalk.dim('\nMultiple instances available. Select one:\n'));
  return await pickFromList(deployments);
}

/**
 * Show an interactive picker for instances
 */
async function pickFromList(names) {
  const choices = names.map(name => {
    const deployment = loadDeployment(name);
    const status = deployment?.status || 'unknown';
    const ip = deployment?.serverIp || '';
    
    const statusIcon = {
      created: '⚪',
      deploying: '🔵',
      deployed: '🟢',
      failed: '🔴'
    }[status] || '⚫';
    
    return {
      name: `${statusIcon} ${name}${ip ? chalk.dim(` (${ip})`) : ''}`,
      value: name,
      short: name
    };
  });
  
  const { selected } = await inquirer.prompt([{
    type: 'list',
    name: 'selected',
    message: 'Select instance:',
    choices
  }]);
  
  return { name: selected, deployment: loadDeployment(selected) };
}

/**
 * Require an instance - exits if not found
 */
export async function requireInstance(nameOrId, commandName) {
  const result = await resolveInstance(nameOrId);
  
  if (!result) {
    if (!nameOrId) {
      console.log(chalk.dim(`Usage: cloudclaw ${commandName} [instance-name]\n`));
    }
    process.exit(1);
  }
  
  return result;
}
