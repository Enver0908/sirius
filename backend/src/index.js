require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { applySecurityMiddleware } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3001;

applySecurityMiddleware(app);
app.use(cookieParser());

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'sirius-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/shops', require('./routes/shops'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/webhooks/shopify', require('./routes/webhooks'));

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Endpoint bulunamadi' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'server_error', message: 'Sunucu hatasi' });
});

app.listen(PORT, async () => {
  try {
    console.log(`Sirius backend running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    const { ensureUploadStorage } = require('./services/attachments');
    ensureUploadStorage();

    const db = require('./db/client');
    await db.testConnection();

    const { runMigrations } = require('./db/migrate');
    await runMigrations();

    const { assertProductionCompliance } = require('./services/production-guard');
    await assertProductionCompliance(db);

    const { startSyncJobs } = require('./jobs/sync');
    startSyncJobs();
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
});

const shutdown = async () => {
  console.log('Shutting down...');
  const db = require('./db/client');
  await db.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
