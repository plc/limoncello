/**
 * Prello -- Local Kanban board for human-AI collaboration
 *
 * Entry point. Sets up Express server with:
 * - SQLite schema initialization on startup
 * - Project and Card API routes
 * - Static file serving for web UI
 * - Health check endpoints
 * - MCP server via Streamable HTTP transport at /mcp
 *
 * Environment variables:
 * - PORT: Server port (default: 3654)
 * - DATABASE_PATH: SQLite file path (default: ./data/prello.db)
 * - PRELLO_API_KEY: Bearer token for API auth (optional; if unset, no auth required)
 */

const crypto = require('node:crypto');
const http = require('http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { setup: setupWebSocket } = require('./ws');
const { db, initSchema } = require('./db');
const projectsRouter = require('./routes/projects');
const cardsRouter = require('./routes/cards');

const app = express();
const port = process.env.PORT || 3654;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      'font-src': ["'self'", "https://fonts.gstatic.com"],
      'upgrade-insecure-requests': null,
    },
  },
}));
app.use(express.json());

// Auth middleware -- if PRELLO_API_KEY is set, require Bearer token on /api/* and /mcp routes
const apiKey = process.env.PRELLO_API_KEY;

// Reject API keys that look like third-party credentials (Stripe, etc.)
if (apiKey && /^(sk|pk|rk)_(live|test)_/i.test(apiKey)) {
  console.error('PRELLO_API_KEY looks like a Stripe key. Use a dedicated key for Prello, not a third-party credential.');
  process.exit(1);
}
function requireAuth(req, res, next) {
  if (!apiKey) return next();
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Static files (web UI) -- served before auth so the board is accessible
app.use(express.static(path.join(__dirname, 'public')));

// Health checks (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Project API (auth required if PRELLO_API_KEY is set)
app.use('/api/projects', requireAuth, projectsRouter);

// Card API -- project-scoped
app.use('/api/projects/:projectId/cards', requireAuth, cardsRouter);

// Backward-compat shim: /api/cards routes to the first (Default) project
app.use('/api/cards', requireAuth, (req, res, next) => {
  const defaultProject = db.prepare('SELECT id FROM projects ORDER BY created_at LIMIT 1').get();
  if (!defaultProject) {
    return res.status(404).json({ error: 'No projects exist' });
  }
  req._defaultProjectId = defaultProject.id;
  next();
}, cardsRouter);

// 404 catch-all for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling
app.use((err, req, res, _next) => {
  console.error(`${req.method} ${req.path} error:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Startup (async to allow dynamic ESM imports for MCP)
async function start() {
  initSchema();
  console.log('Database schema initialized');

  // Load ESM modules for MCP Streamable HTTP transport
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { createPrelloMcpServer } = await import('./mcp-tools.mjs');

  // Session management: sessionId -> { transport, server }
  const sessions = new Map();

  function isInitializeRequest(body) {
    if (Array.isArray(body)) {
      return body.some(msg => msg.method === 'initialize');
    }
    return body && body.method === 'initialize';
  }

  // MCP Streamable HTTP endpoint
  app.all('/mcp', requireAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];

    // Route to existing session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session: POST with initialize request and no session ID
    if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, server });
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };

      const mcpBaseUrl = `http://localhost:${port}`;
      const server = createPrelloMcpServer(mcpBaseUrl, apiKey || '');
      await server.connect(transport);

      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Invalid session ID
    if (sessionId) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session not found' },
        id: null,
      });
      return;
    }

    // POST without session ID and not an initialize request
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Bad request: missing session ID' },
      id: null,
    });
  });

  const server = http.createServer(app);
  setupWebSocket(server, apiKey);

  server.listen(port, '0.0.0.0', () => {
    console.log(`Prello running on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start Prello:', err);
  process.exit(1);
});
