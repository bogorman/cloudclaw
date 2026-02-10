import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SessionStore {
  constructor(dbPath) {
    this.db = new Database(dbPath || path.join(__dirname, '../data/sessions.db'));
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        instance_id TEXT,
        instance_name TEXT,
        runner_ws_target TEXT NOT NULL,
        runner_ws_port INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT DEFAULT 'active'
      )
    `);
    
    // Index for user lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
    `);
    
    // Add new columns if they don't exist (migration)
    try {
      this.db.exec('ALTER TABLE sessions ADD COLUMN instance_id TEXT');
    } catch (e) { /* column exists */ }
    try {
      this.db.exec('ALTER TABLE sessions ADD COLUMN instance_name TEXT');
    } catch (e) { /* column exists */ }
  }

  create({ sessionId, userId, instanceId, instanceName, runnerWsTarget, runnerWsPort, expiresAt }) {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (session_id, user_id, instance_id, instance_name, runner_ws_target, runner_ws_port, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      sessionId,
      userId,
      instanceId || null,
      instanceName || 'local',
      runnerWsTarget,
      runnerWsPort,
      expiresAt.toISOString(),
      new Date().toISOString()
    );
  }

  get(sessionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE session_id = ?
    `);
    const row = stmt.get(sessionId);
    if (!row) return null;
    
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      instanceId: row.instance_id,
      instanceName: row.instance_name || 'local',
      runnerWsTarget: row.runner_ws_target,
      runnerWsPort: row.runner_ws_port,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
      status: row.status
    };
  }

  listByUser(userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `);
    
    return stmt.all(userId).map(row => ({
      sessionId: row.session_id,
      userId: row.user_id,
      instanceId: row.instance_id,
      instanceName: row.instance_name || 'local',
      runnerWsTarget: row.runner_ws_target,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
      status: row.status
    }));
  }

  delete(sessionId) {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE session_id = ?
    `);
    stmt.run(sessionId);
  }

  updateStatus(sessionId, status) {
    const stmt = this.db.prepare(`
      UPDATE sessions SET status = ? WHERE session_id = ?
    `);
    stmt.run(status, sessionId);
  }

  cleanupExpired() {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE expires_at < datetime('now')
    `);
    return stmt.run().changes;
  }
}
