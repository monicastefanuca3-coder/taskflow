const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { execFile } = require('child_process');
const { db, hashPassword } = require('../db');
const config = require('../config');

const ROLES = ['user', 'admin'];
const AVATAR_EXT = ['.png', '.jpg', '.jpeg', '.gif'];
const CONVERT_FORMATS = ['png', 'jpg', 'jpeg', 'gif'];

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.status(403).send('Acces interzis — ai nevoie de rol de administrator.');
  next();
}

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return res.status(404).send('Negăsit');
  next();
});

// Avatar: extensie din listă albă, nume generat de server (nu mai vine din input), limită de dimensiune
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, AVATAR_EXT.includes(ext));
  }
});

router.get('/profile', requireLogin, (req, res) => {
  db.get('SELECT avatar FROM users WHERE id = ?', [req.session.user.id], (err, row) => {
    const avatar = (row && row.avatar) || '/uploads/default.png';
    res.render('profile', { user: Object.assign({}, req.session.user, { avatar }) });
  });
});

router.post('/profile/avatar', requireLogin, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.redirect('/profile');
  const avatarPath = '/uploads/' + req.file.filename;
  db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, req.session.user.id], (err) => {
    if (err) console.error(err);
    req.session.user.avatar = avatarPath;
    res.redirect('/profile');
  });
});

// Preferințe: se acceptă doar câmpurile cunoscute, cu valori validate (fără merge peste input)
router.post('/profile/preferences', requireLogin, (req, res) => {
  const body = req.body || {};
  const preferences = { theme: 'light', notifications: true };
  if (body.theme === 'light' || body.theme === 'dark') preferences.theme = body.theme;
  if (typeof body.notifications === 'boolean') preferences.notifications = body.notifications;
  res.json({ preferences });
});

// Conversie avatar: fără shell (execFile), format și nume de fișier validate
router.get('/profile/convert-avatar', requireLogin, (req, res) => {
  const format = String(req.query.format || 'png');
  const avatarFile = path.basename(String(req.query.file || 'default.png'));
  if (!CONVERT_FORMATS.includes(format)) return res.status(400).send('Format invalid');
  if (!/^\w[\w.-]*$/.test(avatarFile)) return res.status(400).send('Nume de fișier invalid');

  const src = path.join(config.uploadsDir, avatarFile);
  const dest = path.join(config.uploadsDir, `converted.${format}`);
  execFile('convert', [src, dest], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Conversie eșuată');
    }
    res.send('Convertit');
  });
});

router.get('/admin/users', requireAdmin, (req, res) => {
  db.all('SELECT id, email, role FROM users', (err, users) => {
    res.render('admin_users', { users: users || [], user: req.session.user });
  });
});

router.post('/admin/users/:id/role', requireAdmin, (req, res) => {
  const role = String(req.body.role || '');
  if (!ROLES.includes(role)) return res.status(400).send('Rol invalid');
  db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id], (err) => {
    if (err) console.error(err);
    res.redirect('/admin/users');
  });
});

router.post('/admin/users', requireAdmin, (req, res) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  const role = ROLES.includes(req.body.role) ? req.body.role : 'user';
  if (email.length > 254 || !email.includes('@') || password.length < 8) {
    return res.status(400).send('Date invalide (email sau parolă prea scurtă)');
  }
  db.run('INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
    [email, hashPassword(password), role],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(400).send('Nu s-a putut crea utilizatorul');
      }
      res.redirect('/admin/users');
    });
});

router.post('/admin/users/:id/delete', requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.session.user.id) {
    return res.status(400).send('Nu îți poți șterge propriul cont');
  }
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
    if (err) console.error(err);
    res.redirect('/admin/users');
  });
});

module.exports = router;