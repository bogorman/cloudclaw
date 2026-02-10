import { Command } from 'commander';
import chalk from 'chalk';
import { newDeployment } from './commands/new.js';
import { deploy } from './commands/deploy.js';
import { status } from './commands/status.js';
import { destroy } from './commands/destroy.js';
import { ssh } from './commands/ssh.js';
import { logs } from './commands/logs.js';
import { list } from './commands/list.js';
import { dashboard } from './commands/dashboard.js';

const program = new Command();

program
  .name('cloudclaw')
  .description('Deploy and manage OpenClaw in the cloud with visual browser sessions')
  .version('0.1.0');

program
  .command('new')
  .description('Create a new instance configuration')
  .action(newDeployment);

program
  .command('deploy [name]')
  .description('Deploy an instance to a VPS')
  .action(deploy);

program
  .command('status [name]')
  .description('Show instance status (picks interactively if not specified)')
  .action(status);

program
  .command('list')
  .alias('ls')
  .description('List all instances')
  .action(list);

program
  .command('ssh [name]')
  .description('SSH into an instance')
  .action(ssh);

program
  .command('logs [name]')
  .option('-f, --follow', 'Follow log output')
  .option('-n, --lines <n>', 'Number of lines', '50')
  .description('View OpenClaw logs')
  .action(logs);

program
  .command('dashboard [name]')
  .description('Open the OpenClaw dashboard')
  .action(dashboard);

program
  .command('destroy [name]')
  .option('-f, --force', 'Skip confirmation')
  .description('Destroy an instance')
  .action(destroy);

console.log(chalk.cyan(`
   ☁️  CloudClaw v0.1.0
   Deploy OpenClaw to the cloud
`));

program.parse();
