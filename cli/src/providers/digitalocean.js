const BASE_URL = 'https://api.digitalocean.com/v2';

export function createDigitalOceanClient(apiKey) {
  async function request(method, path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    // DELETE returns 204 No Content
    if (res.status === 204) return {};
    
    const data = await res.json();
    
    if (!res.ok) {
      const err = new Error(data.message || 'DigitalOcean API error');
      err.code = data.id;
      err.status = res.status;
      throw err;
    }

    return data;
  }

  return {
    // SSH Keys
    async listSSHKeys() {
      const data = await request('GET', '/account/keys');
      return data.ssh_keys;
    },

    async createSSHKey(name, publicKey) {
      const data = await request('POST', '/account/keys', { 
        name, 
        public_key: publicKey 
      });
      return data.ssh_key;
    },

    async deleteSSHKey(idOrFingerprint) {
      await request('DELETE', `/account/keys/${idOrFingerprint}`);
    },

    // Droplets
    async listDroplets() {
      const data = await request('GET', '/droplets');
      return data.droplets;
    },

    async createDroplet(options) {
      const data = await request('POST', '/droplets', options);
      return data;
    },

    async getDroplet(id) {
      const data = await request('GET', `/droplets/${id}`);
      return data.droplet;
    },

    async deleteDroplet(id) {
      await request('DELETE', `/droplets/${id}`);
    },

    async waitForDropletActive(id, timeoutMs = 300000) {
      const start = Date.now();
      
      while (Date.now() - start < timeoutMs) {
        const droplet = await this.getDroplet(id);
        if (droplet.status === 'active') {
          const publicIp = droplet.networks.v4.find(n => n.type === 'public');
          if (publicIp) {
            return droplet;
          }
        }
        await new Promise(r => setTimeout(r, 5000));
      }
      
      throw new Error('Timeout waiting for droplet');
    },

    // Sizes
    async listSizes() {
      const data = await request('GET', '/sizes');
      return data.sizes;
    },

    // Regions
    async listRegions() {
      const data = await request('GET', '/regions');
      return data.regions;
    },

    // Images
    async listImages() {
      const data = await request('GET', '/images?type=distribution');
      return data.images;
    }
  };
}

// Common droplet sizes
export const DO_SIZES = {
  's-1vcpu-1gb': { vcpu: 1, ram: 1, disk: 25, price: '$6/mo' },
  's-1vcpu-2gb': { vcpu: 1, ram: 2, disk: 50, price: '$12/mo' },
  's-2vcpu-2gb': { vcpu: 2, ram: 2, disk: 60, price: '$18/mo' },
  's-2vcpu-4gb': { vcpu: 2, ram: 4, disk: 80, price: '$24/mo' },
  's-4vcpu-8gb': { vcpu: 4, ram: 8, disk: 160, price: '$48/mo' }
};

export const DO_REGIONS = {
  'nyc1': 'New York 1',
  'nyc3': 'New York 3',
  'sfo3': 'San Francisco 3',
  'ams3': 'Amsterdam 3',
  'lon1': 'London 1',
  'fra1': 'Frankfurt 1',
  'sgp1': 'Singapore 1'
};
