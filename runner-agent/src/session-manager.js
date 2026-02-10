import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DISPLAY_POOL_START = 20;
const DISPLAY_POOL_END = 99;
const BIND_IP = process.env.BIND_IP || '127.0.0.1';

export class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.usedDisplays = new Set();
    this.cleanupInterval = null;
  }

  allocateDisplay() {
    for (let d = DISPLAY_POOL_START; d <= DISPLAY_POOL_END; d++) {
      if (!this.usedDisplays.has(d)) {
        this.usedDisplays.add(d);
        return d;
      }
    }
    throw new Error('No available display numbers');
  }

  freeDisplay(displayNum) {
    this.usedDisplays.delete(displayNum);
  }

  async createSession({ sessionId, width, height, ttlSeconds }) {
    if (this.sessions.has(sessionId)) {
      throw new Error('Session already exists');
    }

    const displayNum = this.allocateDisplay();
    const vncPort = 5900 + (displayNum - DISPLAY_POOL_START);
    const wsPort = 7900 + (displayNum - DISPLAY_POOL_START);
    
    const session = {
      sessionId,
      displayNum,
      vncPort,
      wsPort,
      width,
      height,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      status: 'starting',
      pids: {}
    };

    this.sessions.set(sessionId, session);

    try {
      // 1. Start Xvfb
      console.log(`Starting Xvfb on display :${displayNum}`);
      const xvfb = spawn('Xvfb', [
        `:${displayNum}`,
        '-screen', '0', `${width}x${height}x24`,
        '-nolisten', 'tcp'
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      session.pids.xvfb = xvfb.pid;
      this.logProcess(xvfb, 'Xvfb', sessionId);

      // Wait for Xvfb to be ready
      await this.waitForDisplay(displayNum);

      // 2. Start openbox
      console.log(`Starting openbox on display :${displayNum}`);
      const openbox = spawn('openbox', [], {
        env: { ...process.env, DISPLAY: `:${displayNum}` },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      session.pids.openbox = openbox.pid;
      this.logProcess(openbox, 'openbox', sessionId);

      // Give openbox a moment to start
      await this.sleep(500);

      // 3. Start x11vnc
      console.log(`Starting x11vnc on port ${vncPort}`);
      const x11vnc = spawn('x11vnc', [
        '-display', `:${displayNum}`,
        '-rfbport', `${vncPort}`,
        '-listen', BIND_IP,
        '-forever',
        '-shared',
        '-nopw',
        '-noxdamage'
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      session.pids.x11vnc = x11vnc.pid;
      this.logProcess(x11vnc, 'x11vnc', sessionId);

      // Wait for x11vnc to be ready
      await this.sleep(500);

      // 4. Start websockify
      console.log(`Starting websockify on port ${wsPort}`);
      const websockify = spawn('websockify', [
        '--web', '/usr/share/novnc/',
        `${BIND_IP}:${wsPort}`,
        `${BIND_IP}:${vncPort}`
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      session.pids.websockify = websockify.pid;
      this.logProcess(websockify, 'websockify', sessionId);

      // Wait for websockify
      await this.sleep(300);

      session.status = 'running';
      console.log(`Session ${sessionId} started successfully`);
      
      return session;
    } catch (err) {
      // Cleanup on failure
      await this.stopSession(sessionId);
      throw err;
    }
  }

  async waitForDisplay(displayNum, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        await execAsync(`xdpyinfo -display :${displayNum} 2>/dev/null`);
        return true;
      } catch {
        await this.sleep(100);
      }
    }
    throw new Error(`Timeout waiting for display :${displayNum}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  logProcess(proc, name, sessionId) {
    proc.stdout?.on('data', (data) => {
      console.log(`[${sessionId}] ${name} stdout:`, data.toString().trim());
    });
    proc.stderr?.on('data', (data) => {
      console.error(`[${sessionId}] ${name} stderr:`, data.toString().trim());
    });
    proc.on('exit', (code) => {
      console.log(`[${sessionId}] ${name} exited with code ${code}`);
    });
    proc.on('error', (err) => {
      console.error(`[${sessionId}] ${name} error:`, err);
    });
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  listSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      session_id: s.sessionId,
      display: `:${s.displayNum}`,
      status: s.status,
      expires_at: s.expiresAt.toISOString()
    }));
  }

  async stopSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    console.log(`Stopping session ${sessionId}...`);
    session.status = 'stopped';

    // Kill in reverse order
    const killOrder = ['websockify', 'x11vnc', 'openbox', 'xvfb'];
    for (const name of killOrder) {
      const pid = session.pids[name];
      if (pid) {
        try {
          process.kill(pid, 'SIGTERM');
          console.log(`Killed ${name} (pid ${pid})`);
        } catch (err) {
          // Process might already be dead
          if (err.code !== 'ESRCH') {
            console.error(`Failed to kill ${name}:`, err.message);
          }
        }
      }
    }

    this.freeDisplay(session.displayNum);
    this.sessions.delete(sessionId);
    console.log(`Session ${sessionId} stopped`);
  }

  async stopAll() {
    const sessionIds = Array.from(this.sessions.keys());
    for (const id of sessionIds) {
      try {
        await this.stopSession(id);
      } catch (err) {
        console.error(`Failed to stop session ${id}:`, err.message);
      }
    }
  }

  startCleanupLoop(intervalMs = 10000) {
    this.cleanupInterval = setInterval(async () => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions) {
        if (session.expiresAt.getTime() < now && session.status === 'running') {
          console.log(`Session ${sessionId} expired, stopping...`);
          session.status = 'expired';
          try {
            await this.stopSession(sessionId);
          } catch (err) {
            console.error(`Failed to stop expired session ${sessionId}:`, err.message);
          }
        }
      }
    }, intervalMs);
  }

  stopCleanupLoop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  async cleanupOrphans() {
    console.log('Cleaning up orphan processes...');
    
    // Find and kill orphan Xvfb processes on our display range
    try {
      const { stdout } = await execAsync('pgrep -a Xvfb || true');
      const lines = stdout.trim().split('\n').filter(Boolean);
      
      for (const line of lines) {
        const match = line.match(/:(\d+)/);
        if (match) {
          const displayNum = parseInt(match[1]);
          if (displayNum >= DISPLAY_POOL_START && displayNum <= DISPLAY_POOL_END) {
            const pid = parseInt(line.split(' ')[0]);
            console.log(`Killing orphan Xvfb display :${displayNum} (pid ${pid})`);
            try {
              process.kill(pid, 'SIGTERM');
            } catch (err) {
              if (err.code !== 'ESRCH') console.error(err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to cleanup orphans:', err.message);
    }

    // Kill orphan x11vnc, websockify on our ports
    for (const procName of ['x11vnc', 'websockify']) {
      try {
        await execAsync(`pkill -f "${procName}.*:79[0-7][0-9]" || true`);
        await execAsync(`pkill -f "${procName}.*:59[0-7][0-9]" || true`);
      } catch {
        // Ignore
      }
    }
  }
}
