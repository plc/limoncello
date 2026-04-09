/**
 * Limoncello -- Local Kanban board for human-AI collaboration
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
 * - PUBLIC_URL: Public base URL for MCP server (e.g., https://limoncello.fly.dev; defaults to http://localhost:PORT)
 * - DATABASE_PATH: SQLite file path (default: ./data/limoncello.db)
 * - LIMONCELLO_API_KEY: Bearer token for API auth (optional; if unset, no auth required)
 */

const crypto = require('node:crypto');
const http = require('node:http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { setup: setupWebSocket } = require('./ws');
const { db, initSchema } = require('./db');
const { isAuthConfigured } = require('./lib/access');
const projectsRouter = require('./routes/projects');
const cardsRouter = require('./routes/cards');
const keysRouter = require('./routes/keys');
const { hashKey } = require('./routes/keys');
const { manHandler } = require('./routes/man');

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

// Auth middleware -- supports admin key (env var), agent keys (database), or open mode
const adminKey = process.env.LIMONCELLO_API_KEY;

// Reject API keys that look like third-party credentials (Stripe, etc.)
if (adminKey && /^(sk|pk|rk)_(live|test)_/i.test(adminKey)) {
  console.error('LIMONCELLO_API_KEY looks like a Stripe key. Use a dedicated key for Limoncello, not a third-party credential.');
  process.exit(1);
}

/**
 * Authenticate a request. Sets req.authRole to 'admin' or 'agent'.
 * Returns true if authenticated, false otherwise.
 */
function authenticate(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;

  const token = auth.slice(7);
  if (!token) return false;

  // Check admin key first
  if (adminKey && token === adminKey) {
    req.authRole = 'admin';
    return true;
  }

  // Check agent keys in database
  const hash = hashKey(token);
  const agentKey = db.prepare(
    'SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL'
  ).get(hash);

  if (agentKey) {
    req.authRole = 'agent';
    req.agentKeyId = agentKey.id;
    // Update last_used asynchronously (fire-and-forget)
    db.prepare("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?").run(agentKey.id);
    return true;
  }

  return false;
}

function requireAuth(req, res, next) {
  if (!isAuthConfigured()) return next();
  if (authenticate(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  if (!isAuthConfigured()) return next();
  if (authenticate(req) && req.authRole === 'admin') return next();
  if (req.authRole === 'agent') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Static files (web UI) -- served before auth so the board is accessible
app.use(express.static(path.join(__dirname, 'public')));

// Board route -- serves board.html at /board
app.get('/board', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'board.html'));
});

// Health checks (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API manual (no auth)
app.get('/api/man', manHandler);

// Key bootstrapping: POST is unauthenticated (rate-limited inside router)
// GET and DELETE require admin
app.use('/api/keys', (req, res, next) => {
  if (req.method === 'POST') return next(); // unauthenticated
  return requireAdmin(req, res, next);       // admin-only for GET/DELETE
}, keysRouter);

// Project API (auth required if any auth is configured)
app.use('/api/projects', requireAuth, projectsRouter);

// Card API -- project-scoped
app.use('/api/projects/:projectId/cards', requireAuth, cardsRouter);

// Backward-compat shim: /api/cards routes to the caller's first project.
// For admin / open mode this is the first project by created_at (usually Default).
// For agent keys this is the first project owned by the calling key, so each
// agent gets a stable "my default board" without being able to see others'.
app.use('/api/cards', requireAuth, (req, res, next) => {
  let defaultProject;
  if (!isAuthConfigured() || req.authRole === 'admin') {
    defaultProject = db.prepare('SELECT id FROM projects ORDER BY created_at LIMIT 1').get();
  } else {
    defaultProject = db.prepare(
      'SELECT id FROM projects WHERE owner_key_id = ? ORDER BY created_at LIMIT 1'
    ).get(req.agentKeyId);
  }
  if (!defaultProject) {
    return res.status(404).json({ error: 'No projects exist' });
  }
  req._defaultProjectId = defaultProject.id;
  next();
}, cardsRouter);

// 404 catch-all for API routes with helpful discovery hints
app.use('/api', (req, res) => {
  const path = req.path.toLowerCase();
  const method = req.method;
  const response = { error: 'Not found' };

  // Suggest similar endpoints based on common mistakes
  const hints = [];

  // Singular/plural confusion
  if (path === '/card' || path.startsWith('/card/')) {
    hints.push('Did you mean /api/cards (plural)?');
  } else if (path === '/project' || path.startsWith('/project/')) {
    hints.push('Did you mean /api/projects (plural)?');
  } else if (path === '/key' || path.startsWith('/key/')) {
    hints.push('Did you mean /api/keys (plural)?');
  }

  // Missing /api prefix (shouldn't happen in this middleware, but defensive)
  if (path.startsWith('/cards') || path.startsWith('/projects') || path.startsWith('/keys')) {
    hints.push('Routes should include /api prefix: /api/cards, /api/projects, /api/keys');
  }

  // Project-scoped card routes
  if (path.match(/^\/cards\/[a-z0-9_]+/) && !path.includes('/projects/')) {
    hints.push('Card operations are project-scoped. Use /api/projects/{projectId}/cards or /api/cards for Default project.');
  }

  // Missing project ID
  if (path === '/projects//cards' || path.match(/\/projects\/\/cards/)) {
    hints.push('Missing project ID. Use /api/projects/{projectId}/cards');
  }

  // Old MCP endpoint (if someone tries /api/mcp instead of /mcp)
  if (path === '/mcp') {
    hints.push('MCP endpoint is at /mcp (no /api prefix)');
  }

  // Guide to available endpoints
  if (hints.length === 0) {
    hints.push('Available endpoints: /api/man (API documentation), /api/projects, /api/cards, /api/keys');
    hints.push(`Received: ${method} /api${path}`);
  }

  response.hints = hints;
  res.status(404).json(response);
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
  const { createLimoncelloMcpServer } = await import('./mcp-tools.mjs');

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

      // Use PUBLIC_URL env var for deployed environments, localhost for dev
      const mcpBaseUrl = process.env.PUBLIC_URL || `http://localhost:${port}`;

      // SECURITY: Use the caller's bearer token (not the admin key) for this
      // MCP session. The MCP server's api() helper forwards this token on every
      // internal REST call, so the caller's role/ownership is preserved end-to-end.
      // Previously this passed adminKey, which silently elevated any authenticated
      // caller (including self-bootstrapped agent keys) to admin via the MCP tool
      // surface. requireAuth has already validated the header by the time we get
      // here, so the token is either the admin key, a valid agent key, or empty
      // (open mode).
      const auth = req.headers.authorization || '';
      const callerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const server = createLimoncelloMcpServer(mcpBaseUrl, callerToken);
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
  setupWebSocket(server, { adminKey, db, hashKey, isAuthConfigured });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Limoncello running on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start Limoncello:', err);
  process.exit(1);
});
