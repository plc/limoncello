/**
 * WebSocket server tests
 *
 * Tests the WebSocket module at src/ws.js for:
 * - Connection with and without authentication
 * - Project subscription mechanism
 * - Broadcasting to subscribed clients
 * - Cleanup on disconnect
 */

const { describe, it, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const { setup, broadcast } = require('../src/ws');

/**
 * Helper to create an HTTP server with WebSocket support.
 * Returns { server, port, close() }
 */
function createTestServer(apiKey = null) {
  const app = express();
  const server = http.createServer(app);
  setup(server, apiKey);

  return new Promise((resolve, reject) => {
    server.listen(0, 'localhost', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        close: () => new Promise((res) => {
          // Close all WebSocket connections first
          if (server._wss) {
            for (const client of server._wss.clients) {
              client.terminate();
            }
            server._wss.close();
          }
          // Close the HTTP server
          server.close(res);
        }),
      });
    });
    server.on('error', reject);
  });
}

/**
 * Helper to create a WebSocket client and wait for connection.
 */
function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/**
 * Helper to wait for a WebSocket message.
 */
function waitForMessage(ws, timeout = 100) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message timeout')), timeout);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data));
    });
  });
}

/**
 * Helper to wait for WebSocket close event.
 */
function waitForClose(ws, timeout = 100) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Close timeout')), timeout);
    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

describe('WebSocket Connection', () => {
  let testServer;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('allows connection without auth when no apiKey set', async () => {
    testServer = await createTestServer(null);
    const ws = await connectWs(`ws://localhost:${testServer.port}/ws`);
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  });

  it('rejects connection when apiKey is set but no token provided', async () => {
    testServer = await createTestServer('test-key-123');
    const ws = new WebSocket(`ws://localhost:${testServer.port}/ws`);

    // When auth fails, ws throws an error event, not a close event
    await new Promise((resolve, reject) => {
      ws.on('error', (err) => {
        assert.match(err.message, /401/);
        resolve();
      });
      ws.on('open', () => reject(new Error('Should not connect')));
    });
  });

  it('rejects connection when apiKey is set and wrong token provided', async () => {
    testServer = await createTestServer('test-key-123');
    const ws = new WebSocket(`ws://localhost:${testServer.port}/ws?token=wrong-token`);

    await new Promise((resolve, reject) => {
      ws.on('error', (err) => {
        assert.match(err.message, /401/);
        resolve();
      });
      ws.on('open', () => reject(new Error('Should not connect')));
    });
  });

  it('allows connection when correct token provided via query param', async () => {
    testServer = await createTestServer('test-key-123');
    const ws = await connectWs(`ws://localhost:${testServer.port}/ws?token=test-key-123`);
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
  });
});

describe('WebSocket Subscription', () => {
  let testServer;
  const clients = [];

  afterEach(async () => {
    // Close all clients
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    clients.length = 0;

    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('allows client to subscribe to a project', async () => {
    testServer = await createTestServer(null);
    const ws = await connectWs(`ws://localhost:${testServer.port}/ws`);
    clients.push(ws);

    ws.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_test1' }));

    // Subscription happens synchronously on message receipt
    // Use setImmediate to ensure the message handler has processed
    await new Promise(resolve => setTimeout(resolve, 10));

    // Broadcast to the project and verify receipt
    broadcast('prj_test1', { event: 'card.created', cardId: 'crd_123' });
    const msg = await waitForMessage(ws);

    assert.deepEqual(msg, { event: 'card.created', cardId: 'crd_123' });
  });

  it('sends broadcasts only to subscribed project', async () => {
    testServer = await createTestServer(null);
    const ws = await connectWs(`ws://localhost:${testServer.port}/ws`);
    clients.push(ws);

    ws.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_test1' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    // Broadcast to a different project
    broadcast('prj_other', { event: 'card.created', cardId: 'crd_456' });

    // Should NOT receive the message (use shorter timeout for speed)
    const messagePromise = waitForMessage(ws, 50);
    await assert.rejects(messagePromise, /Message timeout/);
  });

  it('allows client to switch subscription', async () => {
    testServer = await createTestServer(null);
    const ws = await connectWs(`ws://localhost:${testServer.port}/ws`);
    clients.push(ws);

    // Subscribe to first project
    ws.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_test1' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    // Switch to second project
    ws.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_test2' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    // Broadcast to first project (should not receive)
    broadcast('prj_test1', { event: 'old' });
    const oldMsgPromise = waitForMessage(ws, 50);
    await assert.rejects(oldMsgPromise, /Message timeout/);

    // Broadcast to second project (should receive)
    broadcast('prj_test2', { event: 'new' });
    const newMsg = await waitForMessage(ws);
    assert.deepEqual(newMsg, { event: 'new' });
  });

  it('allows multiple clients to subscribe to same project', async () => {
    testServer = await createTestServer(null);
    const ws1 = await connectWs(`ws://localhost:${testServer.port}/ws`);
    const ws2 = await connectWs(`ws://localhost:${testServer.port}/ws`);
    clients.push(ws1, ws2);

    ws1.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_shared' }));
    ws2.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_shared' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    broadcast('prj_shared', { event: 'card.updated' });

    const [msg1, msg2] = await Promise.all([
      waitForMessage(ws1),
      waitForMessage(ws2),
    ]);

    assert.deepEqual(msg1, { event: 'card.updated' });
    assert.deepEqual(msg2, { event: 'card.updated' });
  });
});

describe('WebSocket Broadcast', () => {
  let testServer;
  const clients = [];

  afterEach(async () => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    clients.length = 0;

    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('sends JSON message to all subscribed clients', async () => {
    testServer = await createTestServer(null);
    const ws1 = await connectWs(`ws://localhost:${testServer.port}/ws`);
    const ws2 = await connectWs(`ws://localhost:${testServer.port}/ws`);
    clients.push(ws1, ws2);

    ws1.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_broadcast' }));
    ws2.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_broadcast' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    broadcast('prj_broadcast', {
      event: 'card.created',
      card: { id: 'crd_789', title: 'Test' }
    });

    const [msg1, msg2] = await Promise.all([
      waitForMessage(ws1),
      waitForMessage(ws2),
    ]);

    const expected = {
      event: 'card.created',
      card: { id: 'crd_789', title: 'Test' }
    };
    assert.deepEqual(msg1, expected);
    assert.deepEqual(msg2, expected);
  });

  it('is a no-op when no clients subscribed', async () => {
    testServer = await createTestServer(null);

    // Should not throw
    broadcast('prj_nonexistent', { event: 'test' });

    // Create a client and verify it doesn't receive the old broadcast
    const ws = await connectWs(`ws://localhost:${testServer.port}/ws`);
    clients.push(ws);
    ws.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_nonexistent' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    // Should timeout (no message received)
    const msgPromise = waitForMessage(ws, 50);
    await assert.rejects(msgPromise, /Message timeout/);
  });

  it('skips clients that are not in OPEN state', async () => {
    testServer = await createTestServer(null);
    const ws1 = await connectWs(`ws://localhost:${testServer.port}/ws`);
    const ws2 = await connectWs(`ws://localhost:${testServer.port}/ws`);
    clients.push(ws1, ws2);

    ws1.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_skip' }));
    ws2.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_skip' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    // Close ws1
    ws1.close();
    await new Promise(resolve => setTimeout(resolve, 10));

    // Broadcast should only reach ws2
    broadcast('prj_skip', { event: 'after_close' });

    const msg2 = await waitForMessage(ws2);
    assert.deepEqual(msg2, { event: 'after_close' });
  });
});

describe('WebSocket Cleanup', () => {
  let testServer;
  const clients = [];

  afterEach(async () => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    clients.length = 0;

    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('removes client from subscription on disconnect', async () => {
    testServer = await createTestServer(null);
    const ws1 = await connectWs(`ws://localhost:${testServer.port}/ws`);
    const ws2 = await connectWs(`ws://localhost:${testServer.port}/ws`);
    clients.push(ws1, ws2);

    ws1.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_cleanup' }));
    ws2.send(JSON.stringify({ type: 'subscribe', projectId: 'prj_cleanup' }));
    await new Promise(resolve => setTimeout(resolve, 10));

    // Close ws1
    ws1.close();
    await new Promise(resolve => setTimeout(resolve, 10));

    // Broadcast should only reach ws2
    broadcast('prj_cleanup', { event: 'after_disconnect' });

    const msg2 = await waitForMessage(ws2);
    assert.deepEqual(msg2, { event: 'after_disconnect' });

    // ws1 should not receive anything (already closed)
    assert.notEqual(ws1.readyState, WebSocket.OPEN);
  });
});
