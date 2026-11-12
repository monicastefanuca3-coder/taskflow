require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const helmet = require('helmet');
const path = require('path');

const config = require('./config');
const { init } = require('./db');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const profileRoutes = require('./routes/profile');

const app = express();
init();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Headere de securitate (CSP, X-Frame-Options, X-Content-Type-Options etc.)
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: { 'upgrade-insecure-requests': null } // aplicația rulează pe HTTP în demo
  },
  // 'same-origin' (nu 'no-referrer'), altfel browserul trimite "Origin: null" la formulare
  referrerPolicy: { policy: 'same-origin' }
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Cookie de sesiune: HttpOnly, SameSite=Lax, Secure în producție
app.use(cookieSession({
  name: 'tf_session',
  secret: config.sessionSecret,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000
}));

// CSRF: cererile care modifică starea trebuie să vină de pe același host (Origin/Referer)
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const source = req.get('Origin') || req.get('Referer');
  if (!source) return res.status(403).send('Cerere respinsă');
  try {
    if (new URL(source).host !== req.get('Host')) return res.status(403).send('Cerere respinsă');
  } catch (e) {
    return res.status(403).send('Cerere respinsă');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// CORS eliminat: aplicația folosește doar cereri de același origin

app.get('/', (req, res) => res.redirect(req.session.user ? '/tasks' : '/login'));

app.use(authRoutes);
app.use(taskRoutes);
app.use(profileRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Eroare internă. Încearcă din nou mai târziu.');
});

app.listen(config.port, () => {
  console.log(`TaskFlow running on http://localhost:${config.port}`);
});