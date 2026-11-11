const express = require('express');
const router = express.Router();
const request = require('request');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const config = require('../config');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Folderul cu șabloanele predefinite de notițe (puse de aplicație, nu încărcate de utilizatori)
const templatesDir = path.join(config.uploadsDir, 'tasks');

router.get('/tasks', requireLogin, (req, res) => {
  // VULNERABILITY: SQL Injection via search query param, reflected into page too (XSS)
  const search = req.query.q || '';
  const query = search
    ? `SELECT * FROM tasks WHERE user_id = ${req.session.user.id} AND title LIKE '%${search}%'`
    : `SELECT * FROM tasks WHERE user_id = ${req.session.user.id}`;

  db.all(query, (err, tasks) => {
    if (err) return res.status(500).send('Eroare bază de date: ' + err.message);
    res.render('tasks', { tasks: tasks || [], user: req.session.user, search });
  });
});

// --- Rutele cu cale FIXĂ trebuie înregistrate ÎNAINTE de '/tasks/:id', altfel Express le
// confundă cu un id de task (ex: 'export-all' sau 'preview-link' ar fi tratate ca id). ---

// Export pentru TOATE task-urile userului curent — funcționalitate reală, nevulnerabilă:
// conținutul e generat din DB, nu din fișiere de pe disc.
router.get('/tasks/export-all', requireLogin, (req, res) => {
  db.all(`SELECT * FROM tasks WHERE user_id = ${req.session.user.id}`, (err, tasks) => {
    if (err) return res.status(500).send('Eroare bază de date: ' + err.message);
    const content = (tasks || [])
      .map(t => `# ${t.title} [${t.status}]\n${t.description || '(fără descriere)'}`)
      .join('\n\n---\n\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="taskflow-export.txt"');
    res.send(content || 'Nu ai niciun task de exportat.');
  });
});

// Șabloane predefinite de notițe (Planificare sprint / Raport de bug / Daily standup /
// Retrospectivă) — utile când pornești un task nou, ca punct de plecare. Fișierele sunt puse
// de aplicație în public/uploads/tasks/, nu de utilizator.
// VULNERABILITY: path traversal — dropdown-ul din interfață trimite doar numele unui șablon
// valid, dar handler-ul citește parametrul "file" brut din query string și îl lipește direct
// în calea de pe disc, fără să verifice că e chiar unul din șabloanele permise. Oricine poate
// edita manual URL-ul (care e vizibil, pentru că cererea e un simplu GET) și cere orice alt
// fișier de pe disc. Demo: file=sprint-planning.txt (normal) vs file=../../../.env (exploit).
router.get('/tasks/templates', requireLogin, (req, res) => {
  const file = req.query.file || 'sprint-planning.txt';
  const filePath = path.join(templatesDir, file); // no sanitization of ../../
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(404).send('Șablon negăsit');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(data);
  });
});

// VULNERABILITY: SSRF — serverul face request către orice URL primit de la client.
// (notă: ruta trebuie să stea înaintea lui '/tasks/:id' ca să fie efectiv accesibilă —
// înainte era "mascată" de ruta dinamică și nu se putea testa deloc)
router.get('/tasks/preview-link', requireLogin, (req, res) => {
  const url = req.query.url;
  request(url, (err, response, body) => {
    if (err) return res.status(500).send('Nu s-a putut accesa URL-ul');
    res.send(body ? body.substring(0, 500) : '');
  });
});

// VULNERABILITY: IDOR — no check that the task belongs to the logged-in user
router.get('/tasks/:id', requireLogin, (req, res) => {
  db.get(`SELECT * FROM tasks WHERE id = ${req.params.id}`, (err, task) => {
    if (!task) return res.status(404).send('Negăsit');
    db.all(`SELECT * FROM comments WHERE task_id = ${req.params.id}`, (err2, comments) => {
      res.render('task_detail', { task, comments: comments || [], user: req.session.user });
    });
  });
});

// VULNERABILITY: IDOR — orice utilizator autentificat poate deschide formularul de editare
// pentru orice task, indiferent de proprietar
router.get('/tasks/:id/edit', requireLogin, (req, res) => {
  db.get(`SELECT * FROM tasks WHERE id = ${req.params.id}`, (err, task) => {
    if (!task) return res.status(404).send('Negăsit');
    res.render('task_edit', { task, user: req.session.user });
  });
});

// Export pentru UN task — funcționalitate reală, nevulnerabilă: conținutul (titlu, descriere,
// comentarii) e generat din DB, nu citit de pe disc după un nume dat de utilizator.
router.get('/tasks/:id/export', requireLogin, (req, res) => {
  db.get(`SELECT * FROM tasks WHERE id = ${req.params.id}`, (err, task) => {
    if (!task) return res.status(404).send('Negăsit');
    db.all(`SELECT * FROM comments WHERE task_id = ${req.params.id}`, (err2, comments) => {
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

// VULNERABILITY: SQL Injection pe UPDATE + IDOR (nicio verificare de proprietar)
router.post('/tasks/:id/edit', requireLogin, (req, res) => {
  const { title, description, status } = req.body;
  const query = `UPDATE tasks SET title = '${title}', description = '${description}', status = '${status}' WHERE id = ${req.params.id}`;
  db.run(query, (err) => {
    if (err) return res.status(500).send('Eroare bază de date: ' + err.message);
    res.redirect('/tasks/' + req.params.id);
  });
});

// Schimbare rapidă de status (iconițele din listă) — aceeași breșă ca la editare completă:
// VULNERABILITY: SQL Injection pe UPDATE + IDOR (nicio verificare de proprietar)
router.post('/tasks/:id/status', requireLogin, (req, res) => {
  const { status } = req.body;
  const query = `UPDATE tasks SET status = '${status}' WHERE id = ${req.params.id}`;
  db.run(query, (err) => {
    if (err) return res.status(500).send('Eroare bază de date: ' + err.message);
    res.redirect(req.get('Referrer') || '/tasks');
  });
});

router.post('/tasks', requireLogin, (req, res) => {
  const { title, description } = req.body;
  // VULNERABILITY: SQL Injection on insert
  const query = `INSERT INTO tasks (user_id, title, description) VALUES (${req.session.user.id}, '${title}', '${description}')`;
  db.run(query, (err) => {
    if (err) return res.status(500).send('Eroare bază de date: ' + err.message);
    res.redirect('/tasks');
  });
});

// VULNERABILITY: Stored XSS — comment body rendered without escaping (view uses <%- %>)
router.post('/tasks/:id/comments', requireLogin, (req, res) => {
  const { body } = req.body;
  const query = `INSERT INTO comments (task_id, author, body) VALUES (${req.params.id}, '${req.session.user.email}', '${body}')`;
  db.run(query, (err) => {
    res.redirect('/tasks/' + req.params.id);
  });
});

// VULNERABILITY: IDOR — orice utilizator autentificat poate șterge orice comentariu (nu doar
// pe al lui, nu doar de pe task-urile lui), pentru că nu se verifică deloc autorul
router.post('/tasks/:id/comments/:commentId/delete', requireLogin, (req, res) => {
  db.run(`DELETE FROM comments WHERE id = ${req.params.commentId}`, (err) => {
    res.redirect('/tasks/' + req.params.id);
  });
});

// VULNERABILITY: IDOR on delete — any logged-in user can delete any task by id
router.post('/tasks/:id/delete', requireLogin, (req, res) => {
  db.run(`DELETE FROM tasks WHERE id = ${req.params.id}`, (err) => {
    res.redirect('/tasks');
  });
});

// VULNERABILITY: "formula" helper for due-date math uses eval() on user input (RCE-ish)
router.post('/tasks/calc', requireLogin, (req, res) => {
  const { expression } = req.body;
  try {
    const result = eval(expression); // e.g. require('child_process').execSync('id')
    res.json({ result });
  } catch (e) {
    res.json({ error: e.message });
  }
});

module.exports = router;
