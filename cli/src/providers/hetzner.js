const BASE_URL = 'https://api.hetzner.cloud/v1';

export function createHetznerClient(apiKey) {
  async function request(method, path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json();
    
    if (!res.ok) {
      const err = new Error(data.error?.message || 'Hetzner API error');
      err.code = data.error?.code;
      err.status = res.status;
      throw err;
    }

    return data;
  }

  return {
    // SSH Keys
    async listSSHKeys() {
      const data = await request('GET', '/ssh_keys');
      return data.ssh_keys;
    },

    async createSSHKey(name, publicKey) {
      const data = await request('POST', '/ssh_keys', { name, public_key: publicKey });
      return data.ssh_key;
    },

    async deleteSSHKey(id) {
      await request('DELETE', `/ssh_keys/${id}`);
    },

    // Servers
    async listServers() {
      const data = await request('GET', '/servers');
      return data.servers;
    },

    async createServer(options) {
      const data = await request('POST', '/servers', options);
      return data;
    },

    async getServer(id) {
      const data = await request('GET', `/servers/${id}`);
      return data.server;
    },

    async deleteServer(id) {
      await request('DELETE', `/servers/${id}`);
    },

    async waitForServerRunning(id, timeoutMs = 300000) {
      const start = Date.now();
      
      while (Date.now() - start < timeoutMs) {
        const server = await this.getServer(id);
        if (server.status === 'running' && server.public_net?.ipv4?.ip) {
          return server;
        }
        await new Promise(r => setTimeout(r, 5000));
      }
      
      throw new Error('Timeout waiting for server');
    },

    // Server Types
    async listServerTypes() {
      const data = await request('GET', '/server_types');
      return data.server_types;
    },

    // Locations
    async listLocations() {
      const data = await request('GET', '/locations');
      return data.locations;
    },

    // Images
    async listImages() {
      const data = await request('GET', '/images?type=system');
      return data.images;
    }
  };
}

// Common server types
export const HETZNER_SERVER_TYPES = {
  'cpx11': { vcpu: 2, ram: 2, disk: 40, price: '€4.35/mo' },
  'cpx21': { vcpu: 3, ram: 4, disk: 80, price: '€8.69/mo' },
  'cpx31': { vcpu: 4, ram: 8, disk: 160, price: '€15.59/mo' },
  'cpx41': { vcpu: 8, ram: 16, disk: 240, price: '€30.59/mo' }
};

export const HETZNER_LOCATIONS = {
  'ash': 'Ashburn, VA (US East)',
  'hil': 'Hillsboro, OR (US West)',
  'fsn1': 'Falkenstein (Germany)',
  'nbg1': 'Nuremberg (Germany)',
  'hel1': 'Helsinki (Finland)'
};
