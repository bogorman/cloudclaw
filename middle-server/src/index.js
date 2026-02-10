import express from 'express';
import session from 'express-session';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionStore } from './session-store.js';
import { InstanceStore } from './instance-store.js';
import { MachineStore } from './machine-store.js';
import { RunnerClient } from './runner-client.js';
import { setupWebSocketProxy } from './ws-proxy.js';
import { generateUniqueOceanName } from './ocean-names.js';
import { SSHExecutor, testSSHConnection } from './ssh-executor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'cloudclaw-dev-secret';
const RUNNER_URL = process.env.RUNNER_URL || 'http://127.0.0.1:8080';
const RUNNER_TOKEN = process.env.RUNNER_TOKEN || 'dev-token';

const sessionStore = new SessionStore();
const instanceStore = new InstanceStore();
const machineStore = new MachineStore();
const runnerClient = new RunnerClient(RUNNER_URL, RUNNER_TOKEN);

// Cache of runner clients per instance
const runnerClients = new Map();

// Session middleware
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, '../public')));

// Simple auth - for MVP, auto-login
app.use((req, res, next) => {
  if (!req.session.userId) {
    req.session.userId = 'demo-user';
  }
  next();
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // Check local runner health
    const runnerHealth = await runnerClient.health();
    res.json({ status: 'ok', runner: runnerHealth });
  } catch (err) {
    res.json({ status: 'ok', runner: { status: 'unreachable', error: err.message } });
  }
});

// ============ MACHINE MANAGEMENT ============

// List all machines
app.get('/api/machines', (req, res) => {
  const machines = machineStore.listAll();
  res.json({ machines });
});

// Add a new machine
app.post('/api/machines', async (req, res) => {
  try {
    const { name, host, port, username, authType, sshKey, password, runnerPort } = req.body;
    
    if (!name || !host) {
      return res.status(400).json({ error: 'name and host are required' });
    }

    // Check if name is unique
    if (machineStore.getByName(name)) {
      return res.status(400).json({ error: 'Machine with this name already exists' });
    }

    const machine = machineStore.create({
      name,
      host,
      port: port || 22,
      username: username || 'root',
      authType: authType || 'key',
      sshKey,
      password,
      runnerPort: runnerPort || 8080
    });

    res.json(machine);
  } catch (err) {
    console.error('Failed to add machine:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get machine details
app.get('/api/machines/:id', (req, res) => {
  const machine = machineStore.get(req.params.id) || machineStore.getByName(req.params.id);
  if (!machine) {
    return res.status(404).json({ error: 'Machine not found' });
  }
  res.json(machine);
});

// Test SSH connection to machine
app.post('/api/machines/:id/test', async (req, res) => {
  const machine = machineStore.getRaw(req.params.id);
  if (!machine) {
    return res.status(404).json({ error: 'Machine not found' });
  }

  if (machine.is_local) {
    return res.json({ success: true, message: 'Localhost - no SSH needed' });
  }

  try {
    const result = await testSSHConnection(machine);
    
    // Update status based on result
    machineStore.update(req.params.id, { 
      status: result.success ? 'connected' : 'error' 
    });

    res.json(result);
  } catch (err) {
    machineStore.update(req.params.id, { status: 'error' });
    res.json({ success: false, error: err.message });
  }
});

// Check if Docker runner is running on machine
app.get('/api/machines/:id/runner-status', async (req, res) => {
  const machine = machineStore.getRaw(req.params.id);
  if (!machine) {
    return res.status(404).json({ error: 'Machine not found' });
  }

  if (machine.is_local) {
    // Check local runner
    try {
      const health = await runnerClient.health();
      return res.json({ running: true, health });
    } catch {
      return res.json({ running: false });
    }
  }

  try {
    const executor = new SSHExecutor(machine);
    const running = await executor.checkRunner();
    await executor.close();
    res.json({ running });
  } catch (err) {
    res.json({ running: false, error: err.message });
  }
});

// Start runner on remote machine
app.post('/api/machines/:id/start-runner', async (req, res) => {
  const machine = machineStore.getRaw(req.params.id);
  if (!machine) {
    return res.status(404).json({ error: 'Machine not found' });
  }

  if (machine.is_local) {
    return res.json({ success: true, message: 'Local runner managed by Docker Compose' });
  }

  try {
    const executor = new SSHExecutor(machine);
    const success = await executor.startRunner(machine.runner_port || 8080);
    await executor.close();
    
    if (success) {
      // Update the docker_host for this machine
      machineStore.update(req.params.id, {
        dockerHost: `http://${machine.host}:${machine.runner_port || 8080}`,
        status: 'running'
      });
    }

    res.json({ success });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete machine
app.delete('/api/machines/:id', (req, res) => {
  try {
    const machine = machineStore.get(req.params.id);
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }
    
    machineStore.delete(req.params.id);
    res.json({ status: 'deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============ INSTANCE MANAGEMENT ============

// Get runner client for an instance
function getRunnerClient(instance) {
  if (!instance.runnerUrl) {
    throw new Error('Instance has no runner URL configured');
  }
  
  const key = instance.id;
  if (!runnerClients.has(key)) {
    runnerClients.set(key, new RunnerClient(instance.runnerUrl, instance.runnerToken || 'dev-token'));
  }
  return runnerClients.get(key);
}

// List all instances
app.get('/api/instances', (req, res) => {
  const instances = instanceStore.listAll();
  res.json({ instances });
});

// Create new instance
app.post('/api/instances', (req, res) => {
  try {
    const { provider, region, machineId } = req.body;
    
    // Get the machine to deploy on
    let machine = null;
    if (machineId) {
      machine = machineStore.get(machineId) || machineStore.getByName(machineId);
      if (!machine) {
        return res.status(400).json({ error: 'Machine not found' });
      }
    } else {
      // Default to localhost
      machine = machineStore.getByName('localhost');
    }

    // Create instance record
    const instance = instanceStore.create({
      provider: provider || (machine.isLocal ? 'local' : 'remote'),
      region: region || machine.name,
      ipAddress: machine.host,
      config: { machineId: machine.id, machineName: machine.name, ...req.body.config }
    });
    
    // Configure runner URL based on machine
    let runnerUrl = RUNNER_URL;
    if (!machine.isLocal && machine.dockerHost) {
      runnerUrl = machine.dockerHost;
    } else if (!machine.isLocal) {
      runnerUrl = `http://${machine.host}:${machine.runnerPort || 8080}`;
    }

    instanceStore.update(instance.id, {
      status: 'running',
      runnerUrl: runnerUrl,
      runnerToken: RUNNER_TOKEN
    });
    
    res.json(instanceStore.get(instance.id));
  } catch (err) {
    console.error('Failed to create instance:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get instance details
app.get('/api/instances/:id', async (req, res) => {
  const instance = instanceStore.get(req.params.id) || instanceStore.getByName(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  // Try to get health status
  if (instance.runnerUrl) {
    try {
      const client = getRunnerClient(instance);
      const health = await client.health();
      res.json({ ...instance, runner: health });
    } catch (err) {
      res.json({ ...instance, runner: { status: 'unreachable', error: err.message } });
    }
  } else {
    res.json(instance);
  }
});

// Delete instance
app.delete('/api/instances/:id', (req, res) => {
  const instance = instanceStore.get(req.params.id) || instanceStore.getByName(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  // Clean up sessions
  instanceStore.deleteSessionsByInstance(instance.id);
  runnerClients.delete(instance.id);
  instanceStore.delete(instance.id);
  
  res.json({ status: 'deleted' });
});

// Create session on specific instance
app.post('/api/instances/:id/sessions', async (req, res) => {
  const instance = instanceStore.get(req.params.id) || instanceStore.getByName(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  if (instance.status !== 'running') {
    return res.status(400).json({ error: 'Instance is not running' });
  }

  try {
    const { width = 1920, height = 1080, ttl_seconds = 900 } = req.body;
    const sessionId = uuidv4();
    const client = getRunnerClient(instance);

    const runnerSession = await client.createSession({
      session_id: sessionId,
      width,
      height,
      ttl_seconds
    });

    // Store session locally too
    sessionStore.create({
      sessionId,
      userId: req.session.userId,
      instanceId: instance.id,
      instanceName: instance.name,
      runnerWsTarget: runnerSession.ws_target,
      runnerWsPort: runnerSession.ws_port,
      expiresAt: new Date(runnerSession.expires_at)
    });

    res.json({
      session_id: sessionId,
      instance_name: instance.name,
      view_url: `/sessions/${sessionId}/view`,
      expires_at: runnerSession.expires_at
    });
  } catch (err) {
    console.error('Failed to create session on instance:', err);
    res.status(500).json({ error: err.message });
  }
});

// List sessions for instance
app.get('/api/instances/:id/sessions', (req, res) => {
  const instance = instanceStore.get(req.params.id) || instanceStore.getByName(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  
  const allSessions = sessionStore.listByUser(req.session.userId);
  const sessions = allSessions.filter(s => s.instanceId === instance.id);
  res.json({ sessions });
});

// ============ SESSION MANAGEMENT (backward compatible) ============

// Create interactive session
app.post('/api/sessions', async (req, res) => {
  try {
    const { width = 1920, height = 1080, ttl_seconds = 900 } = req.body;
    const sessionId = uuidv4();
    const userId = req.session.userId;

    // Call runner to create session
    const runnerSession = await runnerClient.createSession({
      session_id: sessionId,
      width,
      height,
      ttl_seconds
    });

    // Store in our DB
    sessionStore.create({
      sessionId,
      userId,
      runnerWsTarget: runnerSession.ws_target,
      runnerWsPort: runnerSession.ws_port,
      expiresAt: new Date(runnerSession.expires_at)
    });

    res.json({
      session_id: sessionId,
      view_url: `/sessions/${sessionId}/view`,
      expires_at: runnerSession.expires_at
    });
  } catch (err) {
    console.error('Failed to create session:', err);
    res.status(500).json({ error: err.message });
  }
});

// List user's sessions
app.get('/api/sessions', (req, res) => {
  const sessions = sessionStore.listByUser(req.session.userId);
  res.json({ sessions });
});

// Get session status
app.get('/api/sessions/:id', async (req, res) => {
  const session = sessionStore.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (session.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Get runner status too
  try {
    const runnerStatus = await runnerClient.getSession(req.params.id);
    res.json({ ...session, runner: runnerStatus });
  } catch (err) {
    res.json({ ...session, runner: { error: err.message } });
  }
});

// Stop session
app.post('/api/sessions/:id/stop', async (req, res) => {
  const session = sessionStore.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (session.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await runnerClient.stopSession(req.params.id);
    sessionStore.delete(req.params.id);
    res.json({ status: 'stopped' });
  } catch (err) {
    console.error('Failed to stop session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Launch Chrome in session
app.post('/api/sessions/:id/chrome', async (req, res) => {
  const session = sessionStore.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (session.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { url = 'https://google.com' } = req.body;
    const result = await runnerClient.launchChrome(req.params.id, url);
    res.json(result);
  } catch (err) {
    console.error('Failed to launch Chrome:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create tunnel for a port
app.post('/api/sessions/:id/tunnels', async (req, res) => {
  const session = sessionStore.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (session.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { port } = req.body;
    const result = await runnerClient.createTunnel(req.params.id, port);
    res.json(result);
  } catch (err) {
    console.error('Failed to create tunnel:', err);
    res.status(500).json({ error: err.message });
  }
});

// List tunnels for a session
app.get('/api/sessions/:id/tunnels', async (req, res) => {
  const session = sessionStore.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (session.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await runnerClient.listTunnels(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Failed to list tunnels:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stop a tunnel
app.delete('/api/sessions/:id/tunnels/:port', async (req, res) => {
  const session = sessionStore.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  if (session.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await runnerClient.stopTunnel(req.params.id, parseInt(req.params.port));
    res.json(result);
  } catch (err) {
    console.error('Failed to stop tunnel:', err);
    res.status(500).json({ error: err.message });
  }
});

// Viewer page
app.get('/sessions/:id/view', (req, res) => {
  const session = sessionStore.get(req.params.id);
  if (!session) {
    return res.status(404).send('Session not found');
  }
  
  if (session.userId !== req.session.userId) {
    return res.status(403).send('Forbidden');
  }

  res.sendFile(path.join(__dirname, '../public/viewer.html'));
});

// Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// WebSocket proxy for noVNC
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  console.log('WebSocket upgrade request:', request.url);
  
  const match = request.url.match(/^\/sessions\/([^/]+)\/ws/);
  if (!match) {
    console.log('WebSocket: URL did not match pattern');
    socket.destroy();
    return;
  }

  const sessionId = match[1];
  const session = sessionStore.get(sessionId);
  
  if (!session) {
    console.log(`WebSocket: Session ${sessionId} not found`);
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  console.log(`WebSocket: Found session, connecting to ${session.runnerWsTarget}`);

  // For MVP, skip auth check - just allow if session exists
  // TODO: Add proper session auth for production
  wss.handleUpgrade(request, socket, head, (ws) => {
    setupWebSocketProxy(ws, session.runnerWsTarget, sessionId);
  });
});

server.listen(PORT, () => {
  console.log(`Dashboard listening on http://localhost:${PORT}`);
  console.log(`Runner URL: ${RUNNER_URL}`);
});
