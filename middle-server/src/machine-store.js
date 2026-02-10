import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class MachineStore {
  constructor(dbPath = path.join(__dirname, '../data/cloudclaw.db')) {
    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS machines (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        host TEXT NOT NULL,
        port INTEGER DEFAULT 22,
        username TEXT DEFAULT 'root',
        auth_type TEXT DEFAULT 'key',
        ssh_key TEXT,
        password TEXT,
        is_local INTEGER DEFAULT 0,
        status TEXT DEFAULT 'unknown',
        docker_host TEXT,
        runner_port INTEGER DEFAULT 8080,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Ensure localhost exists
    this.ensureLocalhost();
  }

  ensureLocalhost() {
    const existing = this.getByName('localhost');
    if (!existing) {
      const id = crypto.randomUUID();
      const stmt = this.db.prepare(`
        INSERT INTO machines (id, name, host, is_local, status, docker_host, runner_port)
        VALUES (?, 'localhost', '127.0.0.1', 1, 'running', 'http://runner:8080', 8080)
      `);
      stmt.run(id);
    }
  }

  create({ name, host, port = 22, username = 'root', authType = 'key', sshKey, password, runnerPort = 8080 }) {
    const id = crypto.randomUUID();
    
    const stmt = this.db.prepare(`
      INSERT INTO machines (id, name, host, port, username, auth_type, ssh_key, password, runner_port)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, name, host, port, username, authType, sshKey || null, password || null, runnerPort);
    
    return this.get(id);
  }

  get(id) {
    const stmt = this.db.prepare('SELECT * FROM machines WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return this.deserialize(row);
  }

  getByName(name) {
    const stmt = this.db.prepare('SELECT * FROM machines WHERE name = ?');
    const row = stmt.get(name);
    if (!row) return null;
    return this.deserialize(row);
  }

  listAll() {
    const stmt = this.db.prepare('SELECT * FROM machines ORDER BY is_local DESC, created_at ASC');
    return stmt.all().map(row => this.deserialize(row));
  }

  update(id, updates) {
    const allowed = ['name', 'host', 'port', 'username', 'auth_type', 'ssh_key', 'password', 'status', 'docker_host', 'runner_port'];
    const sets = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowed.includes(dbKey)) {
        sets.push(`${dbKey} = ?`);
        values.push(value);
      }
    }
    
    if (sets.length === 0) return;
    
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const stmt = this.db.prepare(`UPDATE machines SET ${sets.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  delete(id) {
    // Don't allow deleting localhost
    const machine = this.get(id);
    if (machine?.isLocal) {
      throw new Error('Cannot delete localhost');
    }
    
    const stmt = this.db.prepare('DELETE FROM machines WHERE id = ?');
    stmt.run(id);
  }

  deserialize(row) {
    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      username: row.username,
      authType: row.auth_type,
      sshKey: row.ssh_key,
      // Don't expose password in API responses
      hasPassword: !!row.password,
      isLocal: !!row.is_local,
      status: row.status,
      dockerHost: row.docker_host,
      runnerPort: row.runner_port,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // Get raw data including password (for SSH connections)
  getRaw(id) {
    const stmt = this.db.prepare('SELECT * FROM machines WHERE id = ?');
    return stmt.get(id);
  }
}
