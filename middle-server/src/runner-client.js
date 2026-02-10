export class RunnerClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Token': this.token
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed: ${res.status}`);
    }

    return data;
  }

  async health() {
    return this.request('GET', '/health');
  }

  async createSession({ session_id, width, height, ttl_seconds }) {
    const result = await this.request('POST', '/v1/sessions', {
      session_id,
      width,
      height,
      ttl_seconds
    });
    
    // Rewrite ws_target from 0.0.0.0 to the runner hostname
    // Inside Docker, we connect to 'runner' container
    if (result.ws_target) {
      const runnerHost = new URL(this.baseUrl).hostname;
      result.ws_target = result.ws_target.replace('0.0.0.0', runnerHost);
    }
    
    return result;
  }

  async getSession(sessionId) {
    return this.request('GET', `/v1/sessions/${sessionId}`);
  }

  async listSessions() {
    return this.request('GET', '/v1/sessions');
  }

  async stopSession(sessionId) {
    return this.request('POST', `/v1/sessions/${sessionId}/stop`);
  }

  async launchChrome(sessionId, url) {
    return this.request('POST', `/v1/sessions/${sessionId}/chrome`, { url });
  }

  async createTunnel(sessionId, port) {
    return this.request('POST', `/v1/sessions/${sessionId}/tunnels`, { port });
  }

  async listTunnels(sessionId) {
    return this.request('GET', `/v1/sessions/${sessionId}/tunnels`);
  }

  async stopTunnel(sessionId, port) {
    return this.request('DELETE', `/v1/sessions/${sessionId}/tunnels/${port}`);
  }
}
