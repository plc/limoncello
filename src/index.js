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

// Static files (web UI)
app.use(express.static(path.join(__dirname, 'public')));

// Health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Card API
app.use('/api/cards', cardsRouter);

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
