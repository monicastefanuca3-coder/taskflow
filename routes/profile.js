const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const _ = require('lodash');
const { exec } = require('child_process');
const { db } = require('../db');
const config = require('../config');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// FIX: verificare reală de rol pentru panoul admin — înainte lipsea complet (Broken Access
// Control), acum orice rută /admin/* cere explicit rol 'admin' pe server, nu doar ascunderea
// linkului în interfață.
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.status(403).send('Acces interzis — ai nevoie de rol de administrator.');
  next();
}

// VULNERABILITY: no file-type/extension validation, filename taken from user input -> path traversal
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadsDir),
  filename: (req, file, cb) => cb(null, req.body.filename || file.originalname)
});
const upload = multer({ storage });

router.get('/profile', requireLogin, (req, res) => {
  // sesiunea ține doar id/email/role; avatarul curent îl luăm din DB ca să fie mereu la zi
  db.get(`SELECT avatar FROM users WHERE id = ${req.session.user.id}`, (err, row) => {
    const avatar = (row && row.avatar) || '/uploads/default.png';
    res.render('profile', { user: Object.assign({}, req.session.user, { avatar }) });
  });
});

router.post('/profile/avatar', requireLogin, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.redirect('/profile');
  const avatarPath = '/uploads/' + (req.body.filename || req.file.originalname);
  db.run(`UPDATE users SET avatar = '${avatarPath}' WHERE id = ${req.session.user.id}`, (err) => {
    req.session.user.avatar = avatarPath; // altfel pagina redirecționată tot arată avatarul vechi
    res.redirect('/profile');
  });
});

// VULNERABILITY: Prototype Pollution — merge nesigur al JSON-ului trimis de client peste un
// obiect intern, folosind lodash.merge (exploatabil pe lodash@4.17.4, vezi CVE-2018-16487 / CVE-2019-10744)
// Exploit: POST JSON {"__proto__":{"polluted":"da"}} -> poluează Object.prototype pentru tot procesul
router.post('/profile/preferences', requireLogin, (req, res) => {
  const defaults = { theme: 'light', notifications: true };
  const merged = _.merge(defaults, req.body);
  res.json({ preferences: merged });
});

// VULNERABILITY: command injection — shells out using unsanitized user input
router.get('/profile/convert-avatar', requireLogin, (req, res) => {
  const format = req.query.format || 'png';
  const avatarFile = req.query.file || 'default.png';
  exec(`convert ${config.uploadsDir}/${avatarFile} ${config.uploadsDir}/converted.${format}`, (err, stdout, stderr) => {
    if (err) return res.status(500).send('Conversie eșuată: ' + stderr);
    res.send('Convertit');
  });
});

router.get('/admin/users', requireAdmin, (req, res) => {
  db.all(`SELECT id, email, role, password FROM users`, (err, users) => {
    res.render('admin_users', { users: users || [], user: req.session.user });
  });
});

router.post('/admin/users/:id/role', requireAdmin, (req, res) => {
  const role = req.body.role;
  db.run(`UPDATE users SET role = '${role}' WHERE id = ${req.params.id}`, (err) => {
    res.redirect('/admin/users');
  });
});

// VULNERABILITY: SQL Injection pe INSERT (rămâne — doar accesul e acum verificat, nu și query-ul)
router.post('/admin/users', requireAdmin, (req, res) => {
  const { email, password, role } = req.body;
  const hash = crypto.createHash('md5').update(password || '').digest('hex');
  const userRole = role || 'user';
  const query = `INSERT INTO users (email, password, role) VALUES ('${email}', '${hash}', '${userRole}')`;
  db.run(query, (err) => {
    if (err) return res.status(500).send('Eroare bază de date: ' + err.message);
    res.redirect('/admin/users');
  });
});

// VULNERABILITY: SQL Injection pe DELETE + IDOR pe id (orice admin poate șterge orice id,
// inclusiv alt admin) — rămâne; doar accesul la rută e acum restricționat la admini
router.post('/admin/users/:id/delete', requireAdmin, (req, res) => {
  db.run(`DELETE FROM users WHERE id = ${req.params.id}`, (err) => {
    res.redirect('/admin/users');
  });
});

module.exports = router;
