import inquirer from 'inquirer';
import chalk from 'chalk';
import { randomBytes } from 'crypto';
import { saveDeployment, setConfig, getConfig, listDeployments } from '../services/config.js';
import { HETZNER_SERVER_TYPES, HETZNER_LOCATIONS } from '../providers/hetzner.js';
import { DO_SIZES, DO_REGIONS } from '../providers/digitalocean.js';
import { generateUniqueOceanName } from '../utils/ocean-names.js';

export async function newDeployment() {
  console.log(chalk.cyan('\n🦀 Create a new CloudClaw instance\n'));

  // Generate a suggested ocean name
  const existingNames = listDeployments();
  const suggestedName = generateUniqueOceanName(existingNames);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Instance name:',
      default: suggestedName,
      validate: (v) => /^[a-z0-9-]+$/.test(v) || 'Use lowercase letters, numbers, and hyphens only'
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Cloud provider:',
      choices: [
        { name: 'Hetzner Cloud', value: 'hetzner' },
        { name: 'DigitalOcean', value: 'digitalocean' }
      ]
    }
  ]);

  // Check for name collision
  if (existingNames.includes(answers.name)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: `Instance "${answers.name}" already exists. Overwrite?`,
      default: false
    }]);
    if (!overwrite) {
      console.log(chalk.dim('Cancelled.'));
      return;
    }
  }

  // Provider-specific config
  let providerConfig = {};
  
  if (answers.provider === 'hetzner') {
    let apiKey = getConfig('hetznerApiKey');
    if (!apiKey) {
      const keyAnswer = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: 'Hetzner API Key:',
        mask: '*'
      }]);
      apiKey = keyAnswer.apiKey;
      setConfig('hetznerApiKey', apiKey);
    }

    const hetznerAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'serverType',
        message: 'Server type:',
        choices: Object.entries(HETZNER_SERVER_TYPES).map(([k, v]) => ({
          name: `${k} - ${v.vcpu} vCPU, ${v.ram}GB RAM, ${v.disk}GB disk (${v.price})`,
          value: k
        })),
        default: 'cpx11'
      },
      {
        type: 'list',
        name: 'location',
        message: 'Location:',
        choices: Object.entries(HETZNER_LOCATIONS).map(([k, v]) => ({
          name: `${k} - ${v}`,
          value: k
        })),
        default: 'ash'
      }
    ]);

    providerConfig = {
      hetzner: {
        apiKey,
        serverType: hetznerAnswers.serverType,
        location: hetznerAnswers.location,
        image: 'ubuntu-24.04'
      }
    };
  } else if (answers.provider === 'digitalocean') {
    let apiKey = getConfig('digitaloceanApiKey');
    if (!apiKey) {
      const keyAnswer = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: 'DigitalOcean API Key:',
        mask: '*'
      }]);
      apiKey = keyAnswer.apiKey;
      setConfig('digitaloceanApiKey', apiKey);
    }

    const doAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'size',
        message: 'Droplet size:',
        choices: Object.entries(DO_SIZES).map(([k, v]) => ({
          name: `${k} - ${v.vcpu} vCPU, ${v.ram}GB RAM, ${v.disk}GB disk (${v.price})`,
          value: k
        })),
        default: 's-1vcpu-2gb'
      },
      {
        type: 'list',
        name: 'region',
        message: 'Region:',
        choices: Object.entries(DO_REGIONS).map(([k, v]) => ({
          name: `${k} - ${v}`,
          value: k
        })),
        default: 'nyc1'
      }
    ]);

    providerConfig = {
      digitalocean: {
        apiKey,
        size: doAnswers.size,
        region: doAnswers.region,
        image: 'ubuntu-24-04-x64'
      }
    };
  }

  // AI Provider config
  const aiAnswers = await inquirer.prompt([
    {
      type: 'list',
      name: 'aiProvider',
      message: 'AI Provider:',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI', value: 'openai' },
        { name: 'OpenRouter', value: 'openrouter' },
        { name: 'Skip for now', value: '' }
      ]
    }
  ]);

  let aiConfig = {};
  if (aiAnswers.aiProvider) {
    const apiKeyAnswer = await inquirer.prompt([{
      type: 'password',
      name: 'aiApiKey',
      message: `${aiAnswers.aiProvider} API Key:`,
      mask: '*'
    }]);
    
    aiConfig = {
      aiProvider: aiAnswers.aiProvider,
      aiApiKey: apiKeyAnswer.aiApiKey
    };
  }

  // Channel config
  const channelAnswers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'setupTelegram',
      message: 'Setup Telegram channel?',
      default: false
    }
  ]);

  let channelConfig = {};
  if (channelAnswers.setupTelegram) {
    const telegramAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'telegramBotToken',
        message: 'Telegram Bot Token:'
      },
      {
        type: 'input',
        name: 'telegramAllowFrom',
        message: 'Telegram user ID to allow (optional):'
      }
    ]);
    channelConfig = {
      telegramBotToken: telegramAnswers.telegramBotToken,
      telegramAllowFrom: telegramAnswers.telegramAllowFrom || undefined
    };
  }

  // Tailscale
  const tailscaleAnswers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useTailscale',
      message: 'Use Tailscale for secure access?',
      default: true
    }
  ]);

  // Generate gateway token
  const gatewayToken = randomBytes(32).toString('hex');

  const deployment = {
    name: answers.name,
    provider: answers.provider,
    ...providerConfig,
    ...aiConfig,
    ...channelConfig,
    useTailscale: tailscaleAnswers.useTailscale,
    gatewayToken,
    status: 'created',
    createdAt: new Date().toISOString(),
    checkpoints: []
  };

  saveDeployment(answers.name, deployment);

  console.log(chalk.green(`\n✅ Instance "${chalk.bold(answers.name)}" created!`));
  console.log(chalk.dim(`\nRun ${chalk.cyan(`cloudclaw deploy ${answers.name}`)} to deploy.`));
  console.log(chalk.dim(`Or just ${chalk.cyan('cloudclaw deploy')} to pick from list.`));
}
