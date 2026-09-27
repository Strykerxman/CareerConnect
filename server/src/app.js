const express = require('express');
const cors = require('cors');

function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  // US-01/02: /api/auth is added in the next PRs

  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server.' });
  });
  return app;
}

module.exports = { createApp };
