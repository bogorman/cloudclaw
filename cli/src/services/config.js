import Conf from 'conf';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.cloudclaw');
const DEPLOYMENTS_DIR = join(CONFIG_DIR, 'deployments');

// Ensure directories exist
mkdirSync(CONFIG_DIR, { recursive: true });
mkdirSync(DEPLOYMENTS_DIR, { recursive: true });

const config = new Conf({
  projectName: 'cloudclaw',
  schema: {
    defaultProvider: { type: 'string', default: 'hetzner' },
    hetznerApiKey: { type: 'string' },
    digitaloceanApiKey: { type: 'string' }
  }
});

export function getConfig(key) {
  return config.get(key);
}

export function setConfig(key, value) {
  config.set(key, value);
}

export function getDeploymentPath(name) {
  return join(DEPLOYMENTS_DIR, `${name}.json`);
}

export function saveDeployment(name, data) {
  const path = getDeploymentPath(name);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function loadDeployment(name) {
  const path = getDeploymentPath(name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function listDeployments() {
  if (!existsSync(DEPLOYMENTS_DIR)) return [];
  return readdirSync(DEPLOYMENTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

export function deleteDeployment(name) {
  const path = getDeploymentPath(name);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

// SSH key storage
export function saveSSHKey(name, privateKey, publicKey) {
  const keyDir = join(CONFIG_DIR, 'keys');
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(join(keyDir, `${name}`), privateKey, { mode: 0o600 });
  writeFileSync(join(keyDir, `${name}.pub`), publicKey);
}

export function loadSSHKey(name) {
  const keyDir = join(CONFIG_DIR, 'keys');
  const privatePath = join(keyDir, name);
  const publicPath = join(keyDir, `${name}.pub`);
  
  if (!existsSync(privatePath)) return null;
  
  return {
    privateKey: readFileSync(privatePath, 'utf-8'),
    publicKey: readFileSync(publicPath, 'utf-8')
  };
}

export function deleteSSHKey(name) {
  const keyDir = join(CONFIG_DIR, 'keys');
  const privatePath = join(keyDir, name);
  const publicPath = join(keyDir, `${name}.pub`);
  
  if (existsSync(privatePath)) unlinkSync(privatePath);
  if (existsSync(publicPath)) unlinkSync(publicPath);
}
