/**
 * API Manual Tests
 *
 * Tests for GET /api/man -- the self-describing API manual endpoint.
 * Verifies structure, content, and accessibility without auth.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp, resetDb } = require('./helpers');
const { manual } = require('../src/routes/man');

describe('API Manual (GET /api/man)', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    resetDb();
  });

  it('returns 200 with JSON content-type', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200)
      .expect('Content-Type', /json/);

    assert.ok(res.body);
  });

  it('has all required top-level keys', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    const expectedKeys = [
      'name', 'version', 'description', 'base_url',
      'authentication', 'errors', 'concepts', 'schemas',
      'endpoints', 'websocket', 'mcp',
    ];

    for (const key of expectedKeys) {
      assert.ok(key in res.body, `Missing top-level key: ${key}`);
    }
  });

  it('has correct name and version', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    assert.equal(res.body.name, 'limoncello');
    assert.equal(res.body.version, '1.0.0');
  });

  it('documents authentication correctly', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    const auth = res.body.authentication;
    assert.equal(auth.type, 'bearer');
    assert.equal(auth.header, 'Authorization');
    assert.equal(auth.env_var, 'LIMONCELLO_API_KEY');
    assert.ok(Array.isArray(auth.unauthenticated_endpoints));
    assert.ok(auth.unauthenticated_endpoints.includes('GET /api/man'));
    assert.ok(auth.unauthenticated_endpoints.includes('GET /health'));
  });

  it('lists itself in its own endpoints array', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    const manEndpoint = res.body.endpoints.find(
      e => e.method === 'GET' && e.path === '/api/man'
    );
    assert.ok(manEndpoint, 'Manual endpoint should list itself');
    assert.equal(manEndpoint.auth, false);
  });

  it('contains exactly 21 endpoints', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    assert.equal(res.body.endpoints.length, 21,
      `Expected 21 endpoints, got ${res.body.endpoints.length}: ${res.body.endpoints.map(e => `${e.method} ${e.path}`).join(', ')}`);
  });

  it('every endpoint has method, path, and summary', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    for (const endpoint of res.body.endpoints) {
      assert.ok(endpoint.method, `Endpoint missing method: ${JSON.stringify(endpoint)}`);
      assert.ok(endpoint.path, `Endpoint missing path: ${JSON.stringify(endpoint)}`);
      assert.ok(endpoint.summary, `Endpoint missing summary: ${JSON.stringify(endpoint)}`);
      assert.ok('auth' in endpoint, `Endpoint missing auth field: ${endpoint.method} ${endpoint.path}`);
    }
  });

  it('includes both project and card schemas', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    assert.ok(res.body.schemas.project, 'Missing project schema');
    assert.ok(res.body.schemas.card, 'Missing card schema');
    assert.ok(res.body.schemas.card.id, 'Card schema missing id field');
    assert.ok(res.body.schemas.card.title, 'Card schema missing title field');
    assert.ok(res.body.schemas.card.status, 'Card schema missing status field');
    assert.ok(res.body.schemas.project.columns, 'Project schema missing columns field');
  });

  it('documents WebSocket protocol', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    const ws = res.body.websocket;
    assert.equal(ws.path, '/ws');
    assert.ok(ws.auth);
    assert.ok(ws.protocol.subscribe);
    assert.ok(ws.protocol.events);
    assert.ok(Array.isArray(ws.protocol.events.types));
    assert.ok(ws.protocol.events.types.length > 0);
  });

  it('documents MCP tools', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    const mcp = res.body.mcp;
    assert.equal(mcp.http_endpoint, '/mcp');
    assert.ok(mcp.stdio_command);
    assert.ok(Array.isArray(mcp.tools));
    assert.equal(mcp.tools.length, 7);

    const toolNames = mcp.tools.map(t => t.name);
    assert.ok(toolNames.includes('limoncello_projects'));
    assert.ok(toolNames.includes('limoncello_add'));
    assert.ok(toolNames.includes('limoncello_list'));
    assert.ok(toolNames.includes('limoncello_move'));
    assert.ok(toolNames.includes('limoncello_board'));
    assert.ok(toolNames.includes('limoncello_changes'));
    assert.ok(toolNames.includes('limoncello_create_project'));
  });

  it('exported manual object matches endpoint response', async () => {
    const res = await request(app)
      .get('/api/man')
      .expect(200);

    assert.deepEqual(res.body, manual);
  });
});
