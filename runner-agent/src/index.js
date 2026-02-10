import express from 'express';
import { SessionManager } from './session-manager.js';

const app = express();
app.use(express.json());

const PORT = process.env.AGENT_PORT || 8080;
const BIND_IP = process.env.BIND_IP || '127.0.0.1';
const API_TOKEN = process.env.API_TOKEN || 'dev-token';

const sessionManager = new SessionManager();

// Simple auth middleware
function authenticate(req, res, next) {
  const token = req.headers['x-api-token'] || req.headers.authorization?.replace('Bearer ', '');
  if (token !== API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(authenticate);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessionManager.listSessions().length });
});

// Create interactive session
app.post('/v1/sessions', async (req, res) => {
  try {
    const { session_id, width = 1920, height = 1080, ttl_seconds = 900 } = req.body;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }
    
    const session = await sessionManager.createSession({
      sessionId: session_id,
      width,
      height,
      ttlSeconds: ttl_seconds
    });
    
    res.json({
      session_id: session.sessionId,
      display: `:${session.displayNum}`,
      ws_target: `ws://${BIND_IP}:${session.wsPort}`,
      vnc_port: session.vncPort,
      ws_port: session.wsPort,
      expires_at: session.expiresAt.toISOString(),
      status: session.status
    });
  } catch (err) {
    console.error('Failed to create session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get session status
app.get('/v1/sessions/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    session_id: session.sessionId,
    display: `:${session.displayNum}`,
    ws_target: `ws://${BIND_IP}:${session.wsPort}`,
    vnc_port: session.vncPort,
    ws_port: session.wsPort,
    expires_at: session.expiresAt.toISOString(),
    status: session.status,
    created_at: session.createdAt.toISOString()
  });
});

// List all sessions
app.get('/v1/sessions', (req, res) => {
  const sessions = sessionManager.listSessions();
  res.json({ sessions });
});

// Stop session
app.post('/v1/sessions/:id/stop', async (req, res) => {
  try {
    await sessionManager.stopSession(req.params.id);
    res.json({ status: 'stopped' });
  } catch (err) {
    if (err.message === 'Session not found') {
      return res.status(404).json({ error: 'Session not found' });
    }
    console.error('Failed to stop session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Launch Chrome in session
app.post('/v1/sessions/:id/chrome', async (req, res) => {
  try {
    const { url = 'https://google.com' } = req.body;
    const result = await sessionManager.launchChrome(req.params.id, url);
    res.json(result);
  } catch (err) {
    if (err.message === 'Session not found') {
      return res.status(404).json({ error: 'Session not found' });
    }
    console.error('Failed to launch Chrome:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cleanup orphans on startup
sessionManager.cleanupOrphans();

// Start TTL cleanup loop
sessionManager.startCleanupLoop();

app.listen(PORT, BIND_IP, () => {
  console.log(`Runner agent listening on ${BIND_IP}:${PORT}`);
  console.log(`API Token: ${API_TOKEN.slice(0, 4)}...`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await sessionManager.stopAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await sessionManager.stopAll();
  process.exit(0);
});
