/**
 * WebSocket server for real-time board updates.
 *
 * Clients connect to /ws, optionally passing ?token=<apiKey> for auth.
 * After connecting, they send { type: 'subscribe', projectId } to receive
 * card mutation broadcasts for that project.
 *
 * Authentication mirrors the HTTP auth model: admin key, agent keys in DB,
 * or open mode (no auth configured). Agent keys may only subscribe to their
 * own projects; attempting to subscribe to another key's project closes the
 * connection with code 1008 (policy violation).
 *
 * Exports:
 *   setup(server, opts) -- attach WebSocket server to the HTTP server.
 *     opts = { adminKey, db, hashKey, isAuthConfigured }
 *   broadcast(projectId, message) -- send JSON message to all subscribers of a project
 */

const { WebSocketServer } = require('ws');

// Map<projectId, Set<WebSocket>>
const subscriptions = new Map();

let wss = null;

/**
 * Attach a WebSocket server to the given HTTP server.
 *
 * When auth is configured, connections without a valid ?token= are rejected.
 * The token may be the admin key (env var) or any non-revoked agent key.
 * Agent-key subscribers can only subscribe to projects they own.
 */
function setup(server, opts) {
  // Support legacy call shape setup(server, null | undefined | string).
  // String form (old admin-key-only signature) is treated as adminKey for
  // back-compat with any caller/test that hasn't been updated yet.
  let adminKey;
  let db;
  let hashKey;
  let isAuthConfigured;
  if (opts && typeof opts === 'object') {
    ({ adminKey, db, hashKey, isAuthConfigured } = opts);
  } else if (typeof opts === 'string') {
    adminKey = opts;
  }

  wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient(info, done) {
      // Open mode -- no auth configured anywhere
      if (typeof isAuthConfigured === 'function' && !isAuthConfigured()) {
        info.req._authRole = 'open';
        info.req._keyId = null;
        return done(true);
      }
      // Legacy signature fallback: no opts given, allow all
      if (!adminKey && !db) {
        info.req._authRole = 'open';
        info.req._keyId = null;
        return done(true);
      }

      const url = new URL(info.req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) return done(false, 401, 'Unauthorized');

      // Admin key bypasses ownership checks
      if (adminKey && token === adminKey) {
        info.req._authRole = 'admin';
        info.req._keyId = null;
        return done(true);
      }

      // Agent key lookup
      if (db && typeof hashKey === 'function') {
        const row = db.prepare(
          'SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL'
        ).get(hashKey(token));
        if (row) {
          info.req._authRole = 'agent';
          info.req._keyId = row.id;
          return done(true);
        }
      }

      done(false, 401, 'Unauthorized');
    },
  });

  wss.on('connection', (ws, req) => {
    ws.subscribedProject = null;
    ws.isAlive = true;
    ws._authRole = (req && req._authRole) || 'open';
    ws._keyId = (req && req._keyId) || null;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'subscribe' && msg.projectId) {
          // Agent keys may only subscribe to projects they own.
          if (ws._authRole === 'agent' && db) {
            const row = db.prepare(
              'SELECT owner_key_id FROM projects WHERE id = ?'
            ).get(msg.projectId);
            if (!row || row.owner_key_id !== ws._keyId) {
              ws.close(1008, 'Forbidden');
              return;
            }
          }
          // Remove from previous subscription
          removeSubscription(ws);
          // Add to new subscription
          ws.subscribedProject = msg.projectId;
          if (!subscriptions.has(msg.projectId)) {
            subscriptions.set(msg.projectId, new Set());
          }
          subscriptions.get(msg.projectId).add(ws);
        }
      } catch {
        // Ignore unparseable messages
      }
    });

    ws.on('close', () => {
      removeSubscription(ws);
    });
  });

  // Ping/pong keepalive every 30s to detect dead connections
  const interval = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  // Store reference on server for cleanup
  server._wss = wss;

  return wss;
}

/**
 * Remove a WebSocket from its current project subscription.
 */
function removeSubscription(ws) {
  if (!ws.subscribedProject) return;
  const set = subscriptions.get(ws.subscribedProject);
  if (set) {
    set.delete(ws);
    if (set.size === 0) subscriptions.delete(ws.subscribedProject);
  }
  ws.subscribedProject = null;
}

/**
 * Broadcast a JSON message to all WebSocket clients subscribed to a project.
 */
function broadcast(projectId, message) {
  const set = subscriptions.get(projectId);
  if (!set || set.size === 0) return;
  const data = JSON.stringify(message);
  for (const ws of set) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data);
    }
  }
}

module.exports = { setup, broadcast };
