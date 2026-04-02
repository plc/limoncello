/**
 * Prello -- Local Kanban board for human-AI collaboration
 *
 * Entry point. Sets up Express server with:
 * - SQLite schema initialization on startup
 * - Card API routes
 * - Static file serving for web UI
 * - Health check endpoints
 *
 * Environment variables:
 * - PORT: Server port (default: 3654)
 * - DATABASE_PATH: SQLite file path (default: ./data/prello.db)
 * - PRELLO_API_KEY: Bearer token for API auth (optional; if unset, no auth required)
 */

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { initSchema } = require('./db');
const cardsRouter = require('./routes/cards');

const app = express();
const port = process.env.PORT || 3654;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'"],
      'upgrade-insecure-requests': null,
    },
  },
}));
app.use(express.json());

// Auth middleware -- if PRELLO_API_KEY is set, require Bearer token on /api/* routes
const apiKey = process.env.PRELLO_API_KEY;
function requireAuth(req, res, next) {
  if (!apiKey) return next();
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Static files (web UI) -- served before auth so the board is accessible
// The UI reads the API key from a meta tag injected at serve time
app.use(express.static(path.join(__dirname, 'public')));

// Health checks (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Card API (auth required if PRELLO_API_KEY is set)
app.use('/api/cards', requireAuth, cardsRouter);

// 404 catch-all for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling
app.use((err, req, res, _next) => {
  console.error(`${req.method} ${req.path} error:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Startup
initSchema();
console.log('Database schema initialized');

app.listen(port, '0.0.0.0', () => {
  console.log(`Prello running on http://localhost:${port}`);
});
