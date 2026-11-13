const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const net = require('net');
const { db } = require('../db');
const config = require('../config');

const STATUSES = ['open', 'in-progress', 'done'];
const TEMPLATES = ['sprint-planning.txt', 'bug-report.txt', 'daily-standup.txt', 'retro.txt'];
const templatesDir = path.join(config.uploadsDir, 'tasks');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function dbFail(res, err) {
  console.error(err);
  return res.status(500).send('Eroare internă');
}

// id-urile din URL trebuie să fie numere
router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return res.status(404).send('Negăsit');
  next();
});
router.param('commentId', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return res.status(404).send('Negăsit');
  next();
});

// Redirecționează înapoi doar către aceeași aplicație
function safeBack(req) {
  const ref = req.get('Referrer');
  if (ref) {
    try {
      const u = new URL(ref);
      if (u.host === req.get('Host')) return u.pathname + u.search;
    } catch (e) { /* ignorăm */ }
  }
  return '/tasks';
}

// SSRF: blocăm adresele interne/private
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') ||
    v.startsWith('fe80') || v.startsWith('::ffff:');
}

// Calculator aritmetic fără eval: acceptă doar numere și + - * / % ( )
function safeCalc(input) {
  const s = String(input).replace(/\s+/g, '');
  if (!s || s.length > 100 || !/^[0-9+\-*/%().]+$/.test(s)) throw new Error('Expresie invalidă');
  let i = 0;
  const peek = () => s[i];

  function number() {
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error('Expresie invalidă');
    i += m[0].length;
    return Number.parseFloat(m[0]);
  }
  function factor() {
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error('Expresie invalidă');
      i++;
      return v;
    }
    return number();
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = s[i++];
      const r = factor();
      if (op === '*') v *= r;
      else if (op === '/') {
        if (r === 0) throw new Error('Împărțire la zero');
        v /= r;
      } else v %= r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const result = expr();
  if (i !== s.length) throw new Error('Expresie invalidă');
  return result;
}

router.get('/tasks', requireLogin, (req, res) => {
  const search = String(req.query.q || '');
  const sql = search
    ? 'SELECT * FROM tasks WHERE user_id = ? AND title LIKE ?'
    : 'SELECT * FROM tasks WHERE user_id = ?';
  const params = search ? [req.session.user.id, `%${search}%`] : [req.session.user.id];
  db.all(sql, params, (err, tasks) => {
    if (err) return dbFail(res, err);
    res.render('tasks', { tasks: tasks || [], user: req.session.user, search });
  });
});

// --- rutele cu cale fixă stau ÎNAINTE de '/tasks/:id' ---

router.get('/tasks/export-all', requireLogin, (req, res) => {
  db.all('SELECT * FROM tasks WHERE user_id = ?', [req.session.user.id], (err, tasks) => {
    if (err) return dbFail(res, err);
    const content = (tasks || [])
      .map(t => `# ${t.title} [${t.status}]\n${t.description || '(fără descriere)'}`)
      .join('\n\n---\n\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="taskflow-export.txt"');
    res.send(content || 'Nu ai niciun task de exportat.');
  });
});

// Șabloane: doar cele 4 nume permise (listă albă)
router.get('/tasks/templates', requireLogin, (req, res) => {
  const file = String(req.query.file || 'sprint-planning.txt');
  if (!TEMPLATES.includes(file)) return res.status(404).send('Șablon negăsit');
  fs.readFile(path.join(templatesDir, file), 'utf8', (err, data) => {
    if (err) return res.status(404).send('Șablon negăsit');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(data);
  });
});

// SSRF: doar http/https, adrese publice, fără redirecturi, răspuns servit ca text simplu
router.get('/tasks/preview-link', requireLogin, async (req, res) => {
  let url;
  try {
    url = new URL(String(req.query.url || ''));
  } catch (e) {
    return res.status(400).send('URL invalid');
  }
  if (!['http:', 'https:'].includes(url.protocol)) return res.status(400).send('Protocol nepermis');

  try {
    const addrs = await dns.lookup(url.hostname, { all: true });
    if (addrs.length === 0 || addrs.some(a => isPrivateIp(a.address))) {
      return res.status(400).send('Adresă nepermisă');
    }
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const body = await response.text();
    res.json({ preview: body.substring(0, 500) });
  } catch (e) {
    res.status(502).send('Nu s-a putut accesa URL-ul');
  }
});

// IDOR: toate interogările verifică și proprietarul (user_id)
router.get('/tasks/:id', requireLogin, (req, res) => {
  db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err, task) => {
    if (err || !task) return res.status(404).send('Negăsit');
    db.all('SELECT * FROM comments WHERE task_id = ?', [task.id], (err2, comments) => {
      res.render('task_detail', { task, comments: comments || [], user: req.session.user });
    });
  });
});

router.get('/tasks/:id/edit', requireLogin, (req, res) => {
  db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err, task) => {
    if (err || !task) return res.status(404).send('Negăsit');
    res.render('task_edit', { task, user: req.session.user });
  });
});

router.get('/tasks/:id/export', requireLogin, (req, res) => {
  db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err, task) => {
    if (err || !task) return res.status(404).send('Negăsit');
    db.all('SELECT * FROM comments WHERE task_id = ?', [task.id], (err2, comments) => {
      const lines = [
        `Task: ${task.title}`,
        `Status: ${task.status}`,
        '',
        task.description || '(fără descriere)',
        '',
        'Comentarii:'
      ];
      (comments || []).forEach(c => lines.push(`- ${c.author}: ${c.body}`));
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="task-${task.id}.txt"`);
      res.send(lines.join('\n'));
    });
  });
});

router.post('/tasks/:id/edit', requireLogin, (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 200);
  const description = String(req.body.description || '').slice(0, 2000);
  const status = String(req.body.status || '');
  if (!title || !STATUSES.includes(status)) return res.status(400).send('Date invalide');

  db.run('UPDATE tasks SET title = ?, description = ?, status = ? WHERE id = ? AND user_id = ?',
    [title, description, status, req.params.id, req.session.user.id],
    function (err) {
      if (err) return dbFail(res, err);
      if (this.changes === 0) return res.status(404).send('Negăsit');
      res.redirect('/tasks/' + req.params.id);
    });
});

router.post('/tasks/:id/status', requireLogin, (req, res) => {
  const status = String(req.body.status || '');
  if (!STATUSES.includes(status)) return res.status(400).send('Status invalid');

  db.run('UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?',
    [status, req.params.id, req.session.user.id],
    function (err) {
      if (err) return dbFail(res, err);
      if (this.changes === 0) return res.status(404).send('Negăsit');
      res.redirect(safeBack(req));
    });
});

router.post('/tasks', requireLogin, (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 200);
  const description = String(req.body.description || '').slice(0, 2000);
  if (!title) return res.redirect('/tasks');

  db.run('INSERT INTO tasks (user_id, title, description) VALUES (?, ?, ?)',
    [req.session.user.id, title, description],
    (err) => {
      if (err) return dbFail(res, err);
      res.redirect('/tasks');
    });
});

router.post('/tasks/:id/comments', requireLogin, (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 1000);
  if (!body) return res.redirect('/tasks/' + req.params.id);

  db.get('SELECT id FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], (err, task) => {
    if (err || !task) return res.status(404).send('Negăsit');
    db.run('INSERT INTO comments (task_id, author, body) VALUES (?, ?, ?)',
      [task.id, req.session.user.email, body],
      (err2) => {
        if (err2) return dbFail(res, err2);
        res.redirect('/tasks/' + task.id);
      });
  });
});

router.post('/tasks/:id/comments/:commentId/delete', requireLogin, (req, res) => {
  db.run(
    'DELETE FROM comments WHERE id = ? AND task_id = ? AND task_id IN (SELECT id FROM tasks WHERE user_id = ?)',
    [req.params.commentId, req.params.id, req.session.user.id],
    (err) => {
      if (err) return dbFail(res, err);
      res.redirect('/tasks/' + req.params.id);
    });
});

router.post('/tasks/:id/delete', requireLogin, (req, res) => {
  db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id], function (err) {
    if (err) return dbFail(res, err);
    if (this.changes > 0) db.run('DELETE FROM comments WHERE task_id = ?', [req.params.id]);
    res.redirect('/tasks');
  });
});

router.post('/tasks/calc', requireLogin, (req, res) => {
  try {
    res.json({ result: safeCalc(req.body.expression) });
  } catch (e) {
    res.status(400).json({ error: 'Expresie invalidă' });
  }
});

module.exports = router;