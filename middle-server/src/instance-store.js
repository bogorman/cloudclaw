import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateUniqueOceanName } from './ocean-names.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class InstanceStore {
  constructor(dbPath = path.join(__dirname, '../data/cloudclaw.db')) {
    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        provider TEXT,
        region TEXT,
        server_id TEXT,
        ip_address TEXT,
        status TEXT DEFAULT 'pending',
        runner_url TEXT,
        runner_token TEXT,
        gateway_port INTEGER DEFAULT 18789,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        config TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instance_sessions (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        display_num INTEGER,
        vnc_port INTEGER,
        ws_port INTEGER,
        width INTEGER,
        height INTEGER,
        status TEXT DEFAULT 'running',
        expires_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
      )
    `);
  }

  // === Instance Management ===

  create({ provider, region, serverId, ipAddress, config } = {}) {
    const id = crypto.randomUUID();
    const existingNames = this.listAll().map(i => i.name);
    const name = generateUniqueOceanName(existingNames);
    
    const stmt = this.db.prepare(`
      INSERT INTO instances (id, name, provider, region, server_id, ip_address, status, config)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `);
    
    stmt.run(id, name, provider, region, serverId, ipAddress, JSON.stringify(config || {}));
    
    return this.get(id);
  }

  get(id) {
    const stmt = this.db.prepare('SELECT * FROM instances WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return this.deserialize(row);
  }

  getByName(name) {
    const stmt = this.db.prepare('SELECT * FROM instances WHERE name = ?');
    const row = stmt.get(name);
    if (!row) return null;
    return this.deserialize(row);
  }

  listAll() {
    const stmt = this.db.prepare('SELECT * FROM instances ORDER BY created_at DESC');
    return stmt.all().map(row => this.deserialize(row));
  }

  update(id, updates) {
    const allowed = ['status', 'ip_address', 'runner_url', 'runner_token', 'gateway_port', 'server_id'];
    const sets = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
      if (allowed.includes(dbKey)) {
        sets.push(`${dbKey} = ?`);
        values.push(value);
      }
    }
    
    if (sets.length === 0) return;
    
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const stmt = this.db.prepare(`UPDATE instances SET ${sets.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  delete(id) {
    const stmt = this.db.prepare('DELETE FROM instances WHERE id = ?');
    stmt.run(id);
  }

  deserialize(row) {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      region: row.region,
      serverId: row.server_id,
      ipAddress: row.ip_address,
      status: row.status,
      runnerUrl: row.runner_url,
      runnerToken: row.runner_token,
      gatewayPort: row.gateway_port,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      config: row.config ? JSON.parse(row.config) : {}
    };
  }

  // === Session Management (per instance) ===

  createSession(instanceId, { sessionId, displayNum, vncPort, wsPort, width, height, expiresAt }) {
    const stmt = this.db.prepare(`
      INSERT INTO instance_sessions (id, instance_id, display_num, vnc_port, ws_port, width, height, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(sessionId, instanceId, displayNum, vncPort, wsPort, width, height, expiresAt);
  }

  getSession(sessionId) {
    const stmt = this.db.prepare(`
      SELECT s.*, i.name as instance_name, i.runner_url, i.runner_token
      FROM instance_sessions s
      JOIN instances i ON s.instance_id = i.id
      WHERE s.id = ?
    `);
    return stmt.get(sessionId);
  }

  listSessionsByInstance(instanceId) {
    const stmt = this.db.prepare(`
      SELECT * FROM instance_sessions WHERE instance_id = ? ORDER BY created_at DESC
    `);
    return stmt.all(instanceId);
  }

  deleteSession(sessionId) {
    const stmt = this.db.prepare('DELETE FROM instance_sessions WHERE id = ?');
    stmt.run(sessionId);
  }

  deleteSessionsByInstance(instanceId) {
    const stmt = this.db.prepare('DELETE FROM instance_sessions WHERE instance_id = ?');
    stmt.run(instanceId);
  }
}
