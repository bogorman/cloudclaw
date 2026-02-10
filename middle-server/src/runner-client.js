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
    return this.request('POST', '/v1/sessions', {
      session_id,
      width,
      height,
      ttl_seconds
    });
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
}
