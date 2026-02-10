import { Client } from 'ssh2';

export class SSHExecutor {
  constructor(machine) {
    this.machine = machine;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        this.conn = conn;
        resolve(conn);
      });
      
      conn.on('error', (err) => {
        reject(err);
      });

      const config = {
        host: this.machine.host,
        port: this.machine.port || 22,
        username: this.machine.username || 'root',
      };

      if (this.machine.auth_type === 'key' && this.machine.ssh_key) {
        config.privateKey = this.machine.ssh_key;
      } else if (this.machine.password) {
        config.password = this.machine.password;
      }

      conn.connect(config);
    });
  }

  async exec(command) {
    if (!this.conn) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) return reject(err);

        let stdout = '';
        let stderr = '';

        stream.on('close', (code) => {
          resolve({ code, stdout, stderr });
        });

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  async close() {
    if (this.conn) {
      this.conn.end();
      this.conn = null;
    }
  }

  // Check if Docker is available on the remote machine
  async checkDocker() {
    try {
      const result = await this.exec('docker --version');
      return result.code === 0;
    } catch {
      return false;
    }
  }

  // Check if the CloudClaw runner container is running
  async checkRunner() {
    try {
      const result = await this.exec('docker ps --filter "name=cloudclaw-runner" --format "{{.Status}}"');
      return result.code === 0 && result.stdout.includes('Up');
    } catch {
      return false;
    }
  }

  // Start CloudClaw runner on remote machine
  async startRunner(port = 8080) {
    const commands = [
      // Pull the image (or build if not available)
      'docker pull ghcr.io/buddybot89/cloudclaw-runner:latest || true',
      
      // Stop existing container if any
      'docker stop cloudclaw-runner 2>/dev/null || true',
      'docker rm cloudclaw-runner 2>/dev/null || true',
      
      // Start new container
      `docker run -d \\
        --name cloudclaw-runner \\
        --restart unless-stopped \\
        --shm-size=2gb \\
        --cap-add=SYS_ADMIN \\
        -p ${port}:8080 \\
        -p 7900-7920:7900-7920 \\
        -e API_TOKEN=dev-token \\
        ghcr.io/buddybot89/cloudclaw-runner:latest || \\
      docker run -d \\
        --name cloudclaw-runner \\
        --restart unless-stopped \\
        --shm-size=2gb \\
        --cap-add=SYS_ADMIN \\
        -p ${port}:8080 \\
        -p 7900-7920:7900-7920 \\
        -e API_TOKEN=dev-token \\
        cloudclaw-runner:latest`
    ];

    for (const cmd of commands) {
      await this.exec(cmd);
    }

    // Verify it started
    await new Promise(r => setTimeout(r, 2000));
    return this.checkRunner();
  }

  // Stop CloudClaw runner on remote machine
  async stopRunner() {
    await this.exec('docker stop cloudclaw-runner 2>/dev/null || true');
    return true;
  }
}

// Test SSH connection without full executor
export async function testSSHConnection(machine) {
  const executor = new SSHExecutor(machine);
  try {
    await executor.connect();
    const result = await executor.exec('echo "Connection successful"');
    await executor.close();
    return { success: true, message: result.stdout.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
