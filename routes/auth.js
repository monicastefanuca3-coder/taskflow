const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const config = require('../config');

router.get('/login', (req, res) => res.render('login', { error: null }));

// VULNERABILITY: SQL Injection — user input concatenated directly into the query
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const passHash = crypto.createHash('md5').update(password || '').digest('hex');

  const query = `SELECT * FROM users WHERE email = '${email}' AND password = '${passHash}'`;
  // e.g. email = admin@taskflow.local' -- logs in as admin without a password

  db.get(query, (err, user) => {
    if (err) return res.status(500).send('Eroare bază de date: ' + err.message); // leaks internals
    if (!user) return res.render('login', { error: 'Date de autentificare incorecte' });

    // VULNERABILITY: JWT signed with weak/hardcoded secret, no expiry, alg not pinned
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret);
    req.session.user = { id: user.id, email: user.email, role: user.role };
    res.cookie('tf_token', token, { httpOnly: false }); // readable by JS -> easier XSS token theft
    res.redirect('/tasks');
  });
});

router.get('/register', (req, res) => res.render('register', { error: null }));

router.post('/register', (req, res) => {
  const { email, password, role } = req.body;
  const hash = crypto.createHash('md5').update(password || '').digest('hex');

  // VULNERABILITY: Mass Assignment — formularul nu are câmp "role", dar backend-ul îl acceptă
  // oricum dacă e trimis direct (ex: curl -d "email=...&password=...&role=admin"), permițând
  // auto-escaladare la cont de admin la înregistrare
  const userRole = role || 'user';

  // VULNERABILITY: SQL Injection on insert as well
  const query = `INSERT INTO users (email, password, role) VALUES ('${email}', '${hash}', '${userRole}')`;
  db.run(query, function (err) {
    if (err) return res.render('register', { error: 'Înregistrare eșuată: ' + err.message });
    req.session.user = { id: this.lastID, email, role: userRole };
    res.redirect('/tasks');
  });
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

// VULNERABILITY: username/account enumeration via different responses + no rate limiting
router.get('/check-email', (req, res) => {
  const email = req.query.email;
  db.get(`SELECT id FROM users WHERE email = '${email}'`, (err, row) => {
    res.json({ exists: !!row });
  });
});

module.exports = router;
