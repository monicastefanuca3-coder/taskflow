const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const config = require('./config');

const db = new sqlite3.Database(config.db);

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

    // weak hashing on purpose (MD5, no salt) — SAST should flag this
    const adminHash = crypto.createHash('md5').update('Admin123!').digest('hex');
    db.run(`INSERT OR IGNORE INTO users (id, email, password, role) VALUES (1, 'admin@taskflow.local', ?, 'admin')`, [adminHash]);

    const demoHash = crypto.createHash('md5').update('password123').digest('hex');
    db.run(`INSERT OR IGNORE INTO users (id, email, password, role) VALUES (2, 'demo@taskflow.local', ?, 'user')`, [demoHash]);

    db.run(`INSERT OR IGNORE INTO tasks (id, user_id, title, description, status) VALUES
      (1, 2, 'Welcome to TaskFlow', 'This is your first task. Edit or delete it.', 'open'),
      (2, 2, 'Plan sprint', 'Draft the backlog for next sprint', 'open')`);
  });
}

module.exports = { db, init };
