require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
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

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// VULNERABILITY: wide-open CORS — any origin can call the API with credentials
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

// VULNERABILITY: session cookie not Secure/HttpOnly/SameSite-strict, weak secret
app.use(cookieSession({
  name: 'tf_session',
  secret: config.sessionSecret,
  httpOnly: false
}));

// VULNERABILITY: no CSRF protection anywhere (no csurf/token on any POST form)
// VULNERABILITY: no helmet() -> missing CSP, X-Frame-Options, X-Content-Type-Options, HSTS etc.
// VULNERABILITY: no rate limiting on login/register/search

app.get('/', (req, res) => res.redirect(req.session.user ? '/tasks' : '/login'));

app.use(authRoutes);
app.use(taskRoutes);
app.use(profileRoutes);

// health check that leaks version/debug info
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    node: process.version,
    env: process.env.NODE_ENV,
    uptime: process.uptime()
  });
});

// VULNERABILITY: verbose error handler — stack traces returned to the client
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('<pre>' + err.stack + '</pre>');
});

app.listen(config.port, () => {
  console.log(`TaskFlow running on http://localhost:${config.port}`);
});
