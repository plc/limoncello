/**
 * WebSocket server for real-time board updates.
 *
 * Clients connect to /ws, optionally passing ?token=<apiKey> for auth.
 * After connecting, they send { type: 'subscribe', projectId } to receive
 * card mutation broadcasts for that project.
 *
 * Exports:
 *   setup(server, apiKey) -- attach WebSocket server to the HTTP server
 *   broadcast(projectId, message) -- send JSON message to all subscribers of a project
 */

const { WebSocketServer } = require('ws');

// Map<projectId, Set<WebSocket>>
const subscriptions = new Map();

let wss = null;

/**
 * Attach a WebSocket server to the given HTTP server.
 * If apiKey is truthy, connections without a valid ?token= are rejected.
 */
function setup(server, apiKey) {
  wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient(info, done) {
      if (!apiKey) return done(true);
      const url = new URL(info.req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (token === apiKey) {
        done(true);
      } else {
        done(false, 401, 'Unauthorized');
      }
    },
  });

  wss.on('connection', (ws) => {
    ws.subscribedProject = null;
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'subscribe' && msg.projectId) {
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
