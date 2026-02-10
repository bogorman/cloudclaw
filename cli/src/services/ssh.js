import { Client } from 'ssh2';
import { generateKeyPairSync } from 'crypto';
import sshpk from 'sshpk';

/**
 * Generate an SSH key pair
 */
export function generateSSHKeyPair(name) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Convert to OpenSSH format
  const pubKey = sshpk.parseKey(publicKey, 'pem');
  const openSSHPub = pubKey.toString('ssh') + ` ${name}`;
  
  const privKey = sshpk.parsePrivateKey(privateKey, 'pem');
  const openSSHPriv = privKey.toString('ssh-private');

  return {
    privateKey: openSSHPriv,
    publicKey: openSSHPub
  };
}

/**
 * Create an SSH connection
 */
export function createSSHConnection(host, privateKey, user = 'root', port = 22) {
  const client = new Client();
  
  return {
    async connect() {
      return new Promise((resolve, reject) => {
        client.on('ready', () => resolve());
        client.on('error', reject);
        client.connect({
          host,
          port,
          username: user,
          privateKey
        });
      });
    },

    async exec(command) {
      return new Promise((resolve, reject) => {
        client.exec(command, (err, stream) => {
          if (err) return reject(err);
          
          let stdout = '';
          let stderr = '';
          
          stream.on('close', (code) => {
            resolve({ stdout, stderr, code });
          });
          stream.on('data', (data) => { stdout += data; });
          stream.stderr.on('data', (data) => { stderr += data; });
        });
      });
    },

    disconnect() {
      client.end();
    },

    isConnected() {
      return client._sock && !client._sock.destroyed;
    },

    getClient() {
      return client;
    }
  };
}

/**
 * Wait for SSH to become available
 */
export async function waitForSSH(host, privateKey, timeoutMs = 180000, pollMs = 5000) {
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    try {
      const conn = createSSHConnection(host, privateKey);
      await Promise.race([
        conn.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
      ]);
      conn.disconnect();
      return true;
    } catch {
      await new Promise(r => setTimeout(r, pollMs));
    }
  }
  
  throw new Error(`SSH timeout after ${timeoutMs / 1000}s`);
}
