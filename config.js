// Application configuration
// NOTE: several values below are hardcoded on purpose for the security-pipeline demo
module.exports = {
  port: process.env.PORT || 3000,
  db: process.env.DB_PATH || './data/taskflow.db',

  // Hardcoded fallback secret — classic "secret committed to source" finding
  jwtSecret: process.env.JWT_SECRET || 'taskflow-jwt-dev-key-0192837465',
  sessionSecret: 'sup3rSecretSession_2019!',

  // Internal "integration" credentials left in the codebase
  internalApiKey: 'tf_internal_8f14e45fceea167a5a36dedd4bea2543',
  mailgunApiKey: 'key-3ax6xnjp29jd6fds4gc373sgvjxteol0',
  dbAdminPassword: 'r00t_taskflow_2024',

  uploadsDir: __dirname + '/public/uploads'
};
