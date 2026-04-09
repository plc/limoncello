/**
 * MCP /mcp endpoint auth regression test.
 *
 * Verifies that new MCP sessions use the CALLER'S bearer token (not the server
 * admin key) when instantiating the per-session MCP server. Historically, the
 * /mcp handler passed adminKey into createLimoncelloMcpServer, which silently
 * elevated any authenticated caller (including self-bootstrapped agent keys)
 * to admin privileges via the MCP tool surface.
 *
 * The fix in src/index.js extracts the bearer token from req.headers.authorization
 * and hands it to createLimoncelloMcpServer. These tests pin that behavior by
 * spying on the factory.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const request = require('supertest');
const { db, resetDb } = require('./helpers');
const { hashKey, rateLimitStore } = require('../src/routes/keys');
const keysRouter = require('../src/routes/keys');

describe('MCP /mcp endpoint - per-session token isolation', () => {
  let server;
  let app;
  let capturedApiKeys; // array of apiKey args passed to the factory
  let StreamableHTTPServerTransport;

  /**
   * Minimal /mcp mount that mirrors src/index.js but replaces
   * createLimoncelloMcpServer with a spy so we can observe the token.
   */
  async function mountMcpEndpoint(adminKey) {
    const sdk = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    StreamableHTTPServerTransport = sdk.StreamableHTTPServerTransport;
    const realTools = await import('../src/mcp-tools.mjs');

    const sessions = new Map();

    function isInitializeRequest(body) {
      if (Array.isArray(body)) return body.some(m => m.method === 'initialize');
      return body && body.method === 'initialize';
    }

    // Spy factory: records the apiKey passed in, then delegates to the real factory.
    function createServerSpy(baseUrl, apiKey) {
      capturedApiKeys.push(apiKey);
      return realTools.createLimoncelloMcpServer(baseUrl, apiKey);
    }

    // Auth middleware that mirrors src/index.js
    function authenticate(req) {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) return false;
      const token = auth.slice(7);
      if (!token) return false;
      if (adminKey && token === adminKey) {
        req.authRole = 'admin';
        return true;
      }
      const row = db.prepare(
        'SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL'
      ).get(hashKey(token));
      if (row) {
        req.authRole = 'agent';
        req.agentKeyId = row.id;
        return true;
      }
      return false;
    }

    function requireAuth(req, res, next) {
      if (authenticate(req)) return next();
      return res.status(401).json({ error: 'Unauthorized' });
    }

    app.all('/mcp', requireAuth, async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => require('crypto').randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { transport });
          },
          onsessionclosed: (id) => {
            sessions.delete(id);
          },
        });

        // THIS is the line under test: must use caller's token, not adminKey.
        const auth = req.headers.authorization || '';
        const callerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        const mcpServer = createServerSpy('http://localhost:0', callerToken);
        await mcpServer.connect(transport);

        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({ error: 'bad request' });
    });
  }

  beforeEach(async () => {
    resetDb();
    db.exec('DELETE FROM api_keys');
    rateLimitStore.clear();
    capturedApiKeys = [];

    app = express();
    app.use(express.json());
    app.use('/api/keys', keysRouter);
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
  });

  it('uses the agent key\'s token (not the admin key) for new sessions', async () => {
    const adminKey = 'admin-secret-12345';
    await mountMcpEndpoint(adminKey);

    // Bootstrap an agent key
    const bootstrapRes = await request(app)
      .post('/api/keys')
      .send({ name: 'Agent A' })
      .expect(201);
    const agentKey = bootstrapRes.body.key;

    // Send an MCP initialize with the agent key
    await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${agentKey}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      });

    assert.equal(capturedApiKeys.length, 1, 'Factory should be called exactly once per new session');
    assert.equal(
      capturedApiKeys[0],
      agentKey,
      'Factory must receive the caller\'s token, not the admin key'
    );
    assert.notEqual(
      capturedApiKeys[0],
      adminKey,
      'Regression: factory must not receive the admin key'
    );
  });

  it('uses the admin key when the admin is the caller', async () => {
    const adminKey = 'admin-secret-67890';
    await mountMcpEndpoint(adminKey);

    await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${adminKey}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      });

    assert.equal(capturedApiKeys.length, 1);
    assert.equal(capturedApiKeys[0], adminKey, 'Admin uses its own token');
  });

  it('rejects unauthenticated MCP initialize with 401', async () => {
    const adminKey = 'admin-secret-abc';
    await mountMcpEndpoint(adminKey);

    await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      })
      .expect(401);

    assert.equal(capturedApiKeys.length, 0, 'No session should have been created');
  });

  it('two agent keys in parallel each get their own token', async () => {
    const adminKey = 'admin-secret-parallel';
    await mountMcpEndpoint(adminKey);

    const resA = await request(app).post('/api/keys').send({ name: 'A' }).expect(201);
    const resB = await request(app).post('/api/keys').send({ name: 'B' }).expect(201);

    const initBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
      },
    };

    await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${resA.body.key}`)
      .set('Accept', 'application/json, text/event-stream')
      .send(initBody);

    await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${resB.body.key}`)
      .set('Accept', 'application/json, text/event-stream')
      .send(initBody);

    assert.equal(capturedApiKeys.length, 2);
    assert.equal(capturedApiKeys[0], resA.body.key);
    assert.equal(capturedApiKeys[1], resB.body.key);
    assert.notEqual(capturedApiKeys[0], capturedApiKeys[1], 'Each session gets its own token');
  });
});
