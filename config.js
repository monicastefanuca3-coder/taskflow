const crypto = require('crypto');

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET trebuie setat în producție');
}

module.exports = {
  port: process.env.PORT || 3000,
  db: process.env.DB_PATH || './data/taskflow.db',
  // Secretul vine din mediu. Fără el se generează unul aleatoriu la pornire
  // (sesiunile se pierd la restart: acceptabil în demo, nu în producție).
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  uploadsDir: __dirname + '/public/uploads'
};