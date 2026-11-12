const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const config = require('./config');

const db = new sqlite3.Database(config.db);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const candidate = crypto.scryptSync(String(password), salt, expected.length);
  return crypto.timingSafeEqual(candidate, expected);
}

function init() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user',
      avatar TEXT DEFAULT '/uploads/default.png'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      description TEXT,
      status TEXT DEFAULT 'open'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      author TEXT,
      body TEXT
    )`);

    const adminHash = hashPassword('Admin123!');
    const demoHash = hashPassword('password123');
    db.run(`INSERT OR IGNORE INTO users (id, email, password, role) VALUES (1, 'admin@taskflow.local', ?, 'admin')`, [adminHash]);
    db.run(`INSERT OR IGNORE INTO users (id, email, password, role) VALUES (2, 'demo@taskflow.local', ?, 'user')`, [demoHash]);

    // migrare: dacă baza de date există deja cu hash-uri MD5 vechi, le înlocuim pentru conturile seed
    db.run(`UPDATE users SET password = ? WHERE id = 1 AND password NOT LIKE '%:%'`, [adminHash]);
    db.run(`UPDATE users SET password = ? WHERE id = 2 AND password NOT LIKE '%:%'`, [demoHash]);

    db.run(`INSERT OR IGNORE INTO tasks (id, user_id, title, description, status) VALUES
      (1, 2, 'Welcome to TaskFlow', 'This is your first task. Edit or delete it.', 'open'),
      (2, 2, 'Plan sprint', 'Draft the backlog for next sprint', 'open')`);
  });
}

module.exports = { db, init, hashPassword, verifyPassword };