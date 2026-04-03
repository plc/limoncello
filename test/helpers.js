/**
 * Test helpers for Limoncello.
 *
 * Sets DATABASE_PATH to :memory: BEFORE requiring the db module,
 * so each test process (node --test runs each file in a child process)
 * gets its own isolated in-memory SQLite database.
 *
 * Exports:
 *   db          -- better-sqlite3 instance (in-memory)
 *   createApp() -- Express app with all routes mounted (no auth)
 *   resetDb()   -- delete all data and recreate default project
 *   getDefaultProject() -- returns the default project row
 */

process.env.DATABASE_PATH = ':memory:';

const express = require('express');
const { db, initSchema, DEFAULT_COLUMNS } = require('../src/db');
const projectsRouter = require('../src/routes/projects');
const cardsRouter = require('../src/routes/cards');
const { manHandler } = require('../src/routes/man');

// Initialize schema once per process
initSchema();

/**
 * Create a fresh Express app with all API routes.
 * No auth middleware -- tests exercise routes directly.
 */
function createApp() {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API manual
  app.get('/api/man', manHandler);

  // Project routes
  app.use('/api/projects', projectsRouter);

  // Project-scoped card routes
  app.use('/api/projects/:projectId/cards', cardsRouter);

  // Backward-compat shim: /api/cards routes to Default project
  app.use('/api/cards', (req, res, next) => {
    const defaultProject = db.prepare('SELECT id FROM projects ORDER BY created_at LIMIT 1').get();
    if (!defaultProject) {
      return res.status(404).json({ error: 'No projects exist' });
    }
    req._defaultProjectId = defaultProject.id;
    next();
  }, cardsRouter);

  return app;
}

/**
 * Delete all cards and projects, then recreate the default project.
 * Call this in beforeEach to get clean state.
 */
function resetDb() {
  db.exec('DELETE FROM cards');
  db.exec('DELETE FROM projects');

  // Recreate default project
  const { projectId } = require('../src/lib/ids');
  const id = projectId();
  db.prepare(`
    INSERT INTO projects (id, name, columns, created_at, updated_at)
    VALUES (?, 'Default', ?, datetime('now'), datetime('now'))
  `).run(id, DEFAULT_COLUMNS);

  return id;
}

/**
 * Get the first (default) project.
 */
function getDefaultProject() {
  const row = db.prepare('SELECT * FROM projects ORDER BY created_at LIMIT 1').get();
  return row ? { ...row, columns: JSON.parse(row.columns) } : null;
}

module.exports = { db, createApp, resetDb, getDefaultProject };
