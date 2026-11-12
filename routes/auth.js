const express = require('express');
const router = express.Router();
const { db, hashPassword, verifyPassword } = require('../db');

router.get('/login', (req, res) => res.render('login', { error: null }));

router.post('/login', (req, res) => {
  const email = String(req.body.email || '');
  const password = String(req.body.password || '');

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Eroare internă');
    }
    if (!user || !verifyPassword(password, user.password)) {
      return res.render('login', { error: 'Date de autentificare incorecte' });
    }
    req.session.user = { id: user.id, email: user.email, role: user.role };
    res.redirect('/tasks');
  });
});

router.get('/register', (req, res) => res.render('register', { error: null }));

router.post('/register', (req, res) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');

  if (email.length > 254 || !email.includes('@') || password.length < 8) {
    return res.render('register', { error: 'Email invalid sau parolă prea scurtă (minim 8 caractere).' });
  }

  // rolul NU mai vine din request: orice cont nou este 'user'
  db.run('INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
    [email, hashPassword(password), 'user'],
    function (err) {
      if (err) {
        console.error(err);
        return res.render('register', { error: 'Înregistrare eșuată. Emailul poate fi deja folosit.' });
      }
      req.session.user = { id: this.lastID, email, role: 'user' };
      res.redirect('/tasks');
    });
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

router.get('/check-email', (req, res) => {
  const email = String(req.query.email || '');
  db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
    res.json({ exists: !!row });
  });
});

module.exports = router;