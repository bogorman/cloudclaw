import express from 'express';
import session from 'express-session';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionStore } from './session-store.js';
import { RunnerClient } from './runner-client.js';
import { setupWebSocketProxy } from './ws-proxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'cloudclaw-dev-secret';
const RUNNER_URL = process.env.RUNNER_URL || 'http://127.0.0.1:8080';
const RUNNER_TOKEN = process.env.RUNNER_TOKEN || 'dev-token';

const sessionStore = new SessionStore();
const runnerClient = new RunnerClient(RUNNER_URL, RUNNER_TOKEN);

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
    // Also check runner health
    const runnerHealth = await runnerClient.health();
    res.json({ status: 'ok', runner: runnerHealth });
  } catch (err) {
    res.json({ status: 'ok', runner: { status: 'unreachable', error: err.message } });
  }
});

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
