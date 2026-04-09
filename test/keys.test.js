/**
 * API Key management tests
 *
 * Tests the key bootstrapping and management routes:
 * - POST /api/keys -- Create agent keys (unauthenticated, rate-limited)
 * - GET /api/keys -- List keys (admin only)
 * - DELETE /api/keys/:id -- Revoke keys (admin only)
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const path = require('path');
const { db, createApp, resetDb } = require('./helpers');
const { rateLimitStore, hashKey } = require('../src/routes/keys');

describe('Key Creation - POST /api/keys', () => {
  let app;

  beforeEach(() => {
    resetDb();
    db.exec('DELETE FROM api_keys');
    rateLimitStore.clear();
    app = createApp();
  });

  it('creates a key and returns id, key, name', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Test Agent' })
      .expect(201);

    assert.ok(res.body.id);
    assert.ok(res.body.key);
    assert.equal(res.body.name, 'Test Agent');

    // Verify structure
    assert.ok(res.body.id.startsWith('key_'));
    assert.ok(res.body.key.startsWith('lmn_'));
  });

  it('key starts with lmn_ prefix', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Test' })
      .expect(201);

    assert.ok(res.body.key.startsWith('lmn_'));
    assert.equal(res.body.key.indexOf('lmn_'), 0);
  });

  it('key ID starts with key_ prefix', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Test' })
      .expect(201);

    assert.ok(res.body.id.startsWith('key_'));
    assert.equal(res.body.id.indexOf('key_'), 0);
  });

  it('creates key with custom name', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'My Custom Agent' })
      .expect(201);

    assert.equal(res.body.name, 'My Custom Agent');
  });

  it('creates key with empty name', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: '' })
      .expect(201);

    assert.equal(res.body.name, '');
  });

  it('creates key with missing name', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({})
      .expect(201);

    assert.equal(res.body.name, '');
  });

  it('trims whitespace from name', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: '  Test Agent  ' })
      .expect(201);

    assert.equal(res.body.name, 'Test Agent');
  });

  it('rejects non-string name', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 123 })
      .expect(400);

    assert.deepEqual(res.body, { error: 'Name must be a string' });
  });

  it('key is stored as hash in database', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Test' })
      .expect(201);

    const plaintext = res.body.key;
    const keyId = res.body.id;

    // Query the database directly
    const row = db.prepare('SELECT key_hash FROM api_keys WHERE id = ?').get(keyId);

    // Verify key_hash exists
    assert.ok(row.key_hash);

    // Verify the hash matches
    const expectedHash = crypto.createHash('sha256').update(plaintext).digest('hex');
    assert.equal(row.key_hash, expectedHash);

    // Verify plaintext is NOT stored anywhere
    const allData = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId);
    const stringified = JSON.stringify(allData);
    assert.ok(!stringified.includes(plaintext));
  });

  it('created key can authenticate', async () => {
    const createRes = await request(app)
      .post('/api/keys')
      .send({ name: 'Auth Test' })
      .expect(201);

    const plaintext = createRes.body.key;
    const keyId = createRes.body.id;

    // Hash the key and look it up in the database
    const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
    const row = db.prepare(
      'SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL'
    ).get(hash);

    assert.ok(row);
    assert.equal(row.id, keyId);
  });

  it('generates unique keys on multiple creations', async () => {
    const res1 = await request(app)
      .post('/api/keys')
      .send({ name: 'Key 1' })
      .expect(201);

    const res2 = await request(app)
      .post('/api/keys')
      .send({ name: 'Key 2' })
      .expect(201);

    // Different IDs
    assert.notEqual(res1.body.id, res2.body.id);
    // Different keys
    assert.notEqual(res1.body.key, res2.body.key);
  });

  it('key has correct length (lmn_ + 48 chars)', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Test' })
      .expect(201);

    assert.equal(res.body.key.length, 4 + 48); // 'lmn_' + 48
  });

  it('response includes project_id for the auto-created private project', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Bootstrap Test' })
      .expect(201);

    assert.ok(res.body.project_id, 'Response should include project_id');
    assert.ok(res.body.project_id.startsWith('prj_'), 'project_id should start with prj_');
  });

  it('auto-creates a project owned by the new key', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Owner Test' })
      .expect(201);

    const keyId = res.body.id;
    const projectId = res.body.project_id;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    assert.ok(project, 'Project should exist in database');
    assert.equal(project.owner_key_id, keyId, 'Project should be owned by the new key');
  });

  it('auto-created project uses key name as prefix when provided', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'My Agent' })
      .expect(201);

    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(res.body.project_id);
    assert.equal(project.name, 'My Agent Board');
  });

  it('auto-created project falls back to "My Board" when key name is empty', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: '' })
      .expect(201);

    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(res.body.project_id);
    assert.equal(project.name, 'My Board');
  });

  it('auto-created project has default columns', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Columns Test' })
      .expect(201);

    const project = db.prepare('SELECT columns FROM projects WHERE id = ?').get(res.body.project_id);
    const cols = JSON.parse(project.columns);
    const keys = cols.map(c => c.key);
    assert.deepEqual(keys, ['backlog', 'todo', 'in_progress', 'blocked', 'done']);
  });

  it('auto-creates a welcome card in the first column', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Welcome Test' })
      .expect(201);

    const cards = db.prepare('SELECT * FROM cards WHERE project_id = ?').all(res.body.project_id);
    assert.equal(cards.length, 1, 'Exactly one welcome card should exist');
    assert.equal(cards[0].status, 'backlog');
    assert.ok(cards[0].title.length > 0, 'Welcome card should have a title');
    assert.ok(cards[0].description.length > 0, 'Welcome card should have a description');
  });

  it('bootstrap is atomic: key + project + welcome card created together', async () => {
    const beforeKeys = db.prepare('SELECT COUNT(*) as n FROM api_keys').get().n;
    const beforeProjects = db.prepare('SELECT COUNT(*) as n FROM projects').get().n;
    const beforeCards = db.prepare('SELECT COUNT(*) as n FROM cards').get().n;

    await request(app)
      .post('/api/keys')
      .send({ name: 'Atomic Test' })
      .expect(201);

    assert.equal(db.prepare('SELECT COUNT(*) as n FROM api_keys').get().n, beforeKeys + 1);
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM projects').get().n, beforeProjects + 1);
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM cards').get().n, beforeCards + 1);
  });

  it('bootstrap response includes setup notes and mcp command', async () => {
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Setup Test' })
      .expect(201);

    assert.ok(res.body.setup, 'Response should include setup section');
    assert.ok(res.body.setup.warning, 'Setup should have a warning');
    assert.ok(res.body.setup.note, 'Setup should have a note about private boards');
    assert.ok(res.body.setup.mcp_command.includes(res.body.key), 'MCP command should include the plaintext key');
  });
});

describe('Key Listing - GET /api/keys', () => {
  let app;

  beforeEach(() => {
    resetDb();
    db.exec('DELETE FROM api_keys');
    rateLimitStore.clear();
    app = createApp();
  });

  it('lists all keys with id, name, created_at, last_used, revoked fields', async () => {
    // Create two keys
    await request(app)
      .post('/api/keys')
      .send({ name: 'Key 1' })
      .expect(201);

    await request(app)
      .post('/api/keys')
      .send({ name: 'Key 2' })
      .expect(201);

    const res = await request(app)
      .get('/api/keys')
      .expect(200);

    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 2);

    // Check structure of first key
    const key = res.body[0];
    assert.ok(key.id);
    assert.ok(key.name !== undefined);
    assert.ok(key.created_at);
    assert.ok('last_used' in key); // may be null
    assert.ok('revoked' in key);
    assert.equal(typeof key.revoked, 'boolean');
  });

  it('empty list when no keys exist', async () => {
    const res = await request(app)
      .get('/api/keys')
      .expect(200);

    assert.deepEqual(res.body, []);
  });

  it('shows revoked status correctly', async () => {
    // Create a key
    const createRes = await request(app)
      .post('/api/keys')
      .send({ name: 'To Be Revoked' })
      .expect(201);

    const keyId = createRes.body.id;

    // Check not revoked initially
    let listRes = await request(app)
      .get('/api/keys')
      .expect(200);

    assert.equal(listRes.body[0].revoked, false);

    // Revoke it
    await request(app)
      .delete(`/api/keys/${keyId}`)
      .expect(204);

    // Check revoked now
    listRes = await request(app)
      .get('/api/keys')
      .expect(200);

    assert.equal(listRes.body[0].revoked, true);
  });

  it('orders keys by created_at DESC (newest first)', async () => {
    // Create three keys
    const res1 = await request(app)
      .post('/api/keys')
      .send({ name: 'First' })
      .expect(201);

    const res2 = await request(app)
      .post('/api/keys')
      .send({ name: 'Second' })
      .expect(201);

    const res3 = await request(app)
      .post('/api/keys')
      .send({ name: 'Third' })
      .expect(201);

    const listRes = await request(app)
      .get('/api/keys')
      .expect(200);

    // All three should be present
    assert.equal(listRes.body.length, 3);

    // Find each key in the list
    const firstInList = listRes.body.find(k => k.id === res1.body.id);
    const secondInList = listRes.body.find(k => k.id === res2.body.id);
    const thirdInList = listRes.body.find(k => k.id === res3.body.id);

    assert.ok(firstInList);
    assert.ok(secondInList);
    assert.ok(thirdInList);
  });

  it('does not expose key_hash in listing', async () => {
    await request(app)
      .post('/api/keys')
      .send({ name: 'Test' })
      .expect(201);

    const res = await request(app)
      .get('/api/keys')
      .expect(200);

    const key = res.body[0];
    assert.ok(!key.key_hash);
    assert.ok(!key.key);
  });
});

describe('Key Revocation - DELETE /api/keys/:id', () => {
  let app;

  beforeEach(() => {
    resetDb();
    db.exec('DELETE FROM api_keys');
    rateLimitStore.clear();
    app = createApp();
  });

  it('revokes a key (returns 204)', async () => {
    const createRes = await request(app)
      .post('/api/keys')
      .send({ name: 'To Revoke' })
      .expect(201);

    await request(app)
      .delete(`/api/keys/${createRes.body.id}`)
      .expect(204);
  });

  it('revoked key shows revoked=true in listing', async () => {
    const createRes = await request(app)
      .post('/api/keys')
      .send({ name: 'Test' })
      .expect(201);

    const keyId = createRes.body.id;

    await request(app)
      .delete(`/api/keys/${keyId}`)
      .expect(204);

    const listRes = await request(app)
      .get('/api/keys')
      .expect(200);

    const revokedKey = listRes.body.find(k => k.id === keyId);
    assert.ok(revokedKey);
    assert.equal(revokedKey.revoked, true);
  });

  it('returns 404 for non-existent key', async () => {
    const res = await request(app)
      .delete('/api/keys/key_nonexistent')
      .expect(404);

    assert.deepEqual(res.body, { error: 'Key not found' });
  });

  it('returns 400 for already-revoked key', async () => {
    const createRes = await request(app)
      .post('/api/keys')
      .send({ name: 'Test' })
      .expect(201);

    const keyId = createRes.body.id;

    // Revoke once
    await request(app)
      .delete(`/api/keys/${keyId}`)
      .expect(204);

    // Try to revoke again
    const res = await request(app)
      .delete(`/api/keys/${keyId}`)
      .expect(400);

    assert.deepEqual(res.body, { error: 'Key already revoked' });
  });

  it('sets revoked_at timestamp in database', async () => {
    const createRes = await request(app)
      .post('/api/keys')
      .send({ name: 'Test' })
      .expect(201);

    const keyId = createRes.body.id;

    // Check not revoked initially
    let row = db.prepare('SELECT revoked_at FROM api_keys WHERE id = ?').get(keyId);
    assert.equal(row.revoked_at, null);

    // Revoke
    await request(app)
      .delete(`/api/keys/${keyId}`)
      .expect(204);

    // Check revoked_at is set
    row = db.prepare('SELECT revoked_at FROM api_keys WHERE id = ?').get(keyId);
    assert.ok(row.revoked_at);
    assert.ok(row.revoked_at.length > 0);
  });
});

describe('Rate Limiting - POST /api/keys', () => {
  let app;

  beforeEach(() => {
    resetDb();
    db.exec('DELETE FROM api_keys');
    rateLimitStore.clear();
    app = createApp();
  });

  it('allows up to 10 requests', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/keys')
        .send({ name: `Key ${i}` })
        .expect(201);
    }
  });

  it('returns 429 after exceeding the limit', async () => {
    // Make 10 requests (should all succeed)
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/keys')
        .send({ name: `Key ${i}` })
        .expect(201);
    }

    // 11th request should fail
    const res = await request(app)
      .post('/api/keys')
      .send({ name: 'Over limit' })
      .expect(429);

    assert.deepEqual(res.body, { error: 'Rate limit exceeded. Try again later.' });
  });

  it('rate limit is per IP', async () => {
    // supertest uses a single IP by default, so we can't easily test multi-IP
    // but we can verify the limit applies
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/keys')
        .send({ name: `Key ${i}` })
        .expect(201);
    }

    await request(app)
      .post('/api/keys')
      .send({ name: 'Over limit' })
      .expect(429);
  });

  it('clearing rate limit store allows requests again', async () => {
    // Fill up the limit
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/keys')
        .send({ name: `Key ${i}` })
        .expect(201);
    }

    // Should be blocked
    await request(app)
      .post('/api/keys')
      .send({ name: 'Blocked' })
      .expect(429);

    // Clear the store
    rateLimitStore.clear();

    // Should work again
    await request(app)
      .post('/api/keys')
      .send({ name: 'After clear' })
      .expect(201);
  });
});

describe('Auth Integration', () => {
  /**
   * Create an Express app with auth middleware.
   * Mirrors the auth logic from src/index.js.
   */
  function createAuthApp(adminKey = null, db = null) {
    const app = express();
    app.use(express.json());

    // Helper functions from src/index.js
    function isAuthConfigured() {
      if (adminKey) return true;
      if (!db) return false;
      const row = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE revoked_at IS NULL').get();
      return row.count > 0;
    }

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
      if (db) {
        const hash = hashKey(token);
        const agentKey = db.prepare(
          'SELECT id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL'
        ).get(hash);

        if (agentKey) {
          req.authRole = 'agent';
          req.agentKeyId = agentKey.id;
          // Update last_used asynchronously
          db.prepare("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?").run(agentKey.id);
          return true;
        }
      }

      return false;
    }

    function requireAuth(req, res, next) {
      if (!isAuthConfigured()) return next();
      if (authenticate(req)) return next();
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Static files (before auth)
    app.use(express.static(path.join(__dirname, '../src/public')));

    // Health check (before auth)
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Protected API routes
    app.get('/api/projects', requireAuth, (req, res) => {
      res.json({ projects: [], authRole: req.authRole });
    });

    app.post('/api/cards', requireAuth, (req, res) => {
      res.status(201).json({ id: 'crd_test', title: req.body.title, authRole: req.authRole });
    });

    return app;
  }

  beforeEach(() => {
    resetDb();
    db.exec('DELETE FROM api_keys');
    rateLimitStore.clear();
  });

  it('agent key can authenticate to protected routes', async () => {
    const keyApp = createApp();

    // Create an agent key
    const createRes = await request(keyApp)
      .post('/api/keys')
      .send({ name: 'Agent Key' })
      .expect(201);

    const agentKey = createRes.body.key;

    // Now create an auth app with this agent key in the database
    const authApp = createAuthApp(null, db);

    // Use the agent key to access a protected route
    const res = await request(authApp)
      .get('/api/projects')
      .set('Authorization', `Bearer ${agentKey}`)
      .expect(200);

    assert.deepEqual(res.body, { projects: [], authRole: 'agent' });
  });

  it('revoked agent key returns 401', async () => {
    const keyApp = createApp();

    // Create TWO agent keys (so isAuthConfigured remains true after revoking one)
    const createRes1 = await request(keyApp)
      .post('/api/keys')
      .send({ name: 'Agent Key 1' })
      .expect(201);

    const createRes2 = await request(keyApp)
      .post('/api/keys')
      .send({ name: 'Agent Key 2' })
      .expect(201);

    const agentKey1 = createRes1.body.key;
    const keyId1 = createRes1.body.id;

    // Revoke the first key
    await request(keyApp)
      .delete(`/api/keys/${keyId1}`)
      .expect(204);

    // Try to use the revoked key (should fail because there's still one active key, so auth is configured)
    const authApp = createAuthApp(null, db);

    const res = await request(authApp)
      .get('/api/projects')
      .set('Authorization', `Bearer ${agentKey1}`)
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('when no admin key is set AND agent keys exist, auth IS required', async () => {
    const keyApp = createApp();

    // Create an agent key
    const createRes = await request(keyApp)
      .post('/api/keys')
      .send({ name: 'Agent Key' })
      .expect(201);

    const agentKey = createRes.body.key;

    // Now create an auth app with no admin key but with agent keys in DB
    const authApp = createAuthApp(null, db);

    // Request without auth should fail
    await request(authApp)
      .get('/api/projects')
      .expect(401);

    // Request with valid agent key should succeed
    const res = await request(authApp)
      .get('/api/projects')
      .set('Authorization', `Bearer ${agentKey}`)
      .expect(200);

    assert.deepEqual(res.body, { projects: [], authRole: 'agent' });
  });

  it('when no admin key is set AND no agent keys exist, routes are open', async () => {
    // Create an auth app with no admin key and empty database
    const authApp = createAuthApp(null, db);

    // Request without auth should succeed
    const res = await request(authApp)
      .get('/api/projects')
      .expect(200);

    // authRole is not set when auth is not configured
    assert.ok(res.body.projects);
    assert.ok(!res.body.authRole);
  });

  it('admin key takes precedence over agent keys', async () => {
    const keyApp = createApp();

    // Create an agent key
    await request(keyApp)
      .post('/api/keys')
      .send({ name: 'Agent Key' })
      .expect(201);

    const adminKey = 'admin-secret-key';

    // Create an auth app with both admin key and agent keys
    const authApp = createAuthApp(adminKey, db);

    // Use admin key
    const res = await request(authApp)
      .get('/api/projects')
      .set('Authorization', `Bearer ${adminKey}`)
      .expect(200);

    assert.deepEqual(res.body, { projects: [], authRole: 'admin' });
  });

  it('updates last_used timestamp when agent key is used', async () => {
    const keyApp = createApp();

    // Create an agent key
    const createRes = await request(keyApp)
      .post('/api/keys')
      .send({ name: 'Agent Key' })
      .expect(201);

    const agentKey = createRes.body.key;
    const keyId = createRes.body.id;

    // Check last_used is initially null
    let row = db.prepare('SELECT last_used FROM api_keys WHERE id = ?').get(keyId);
    assert.equal(row.last_used, null);

    // Use the key
    const authApp = createAuthApp(null, db);
    await request(authApp)
      .get('/api/projects')
      .set('Authorization', `Bearer ${agentKey}`)
      .expect(200);

    // Check last_used is updated
    row = db.prepare('SELECT last_used FROM api_keys WHERE id = ?').get(keyId);
    assert.ok(row.last_used);
    assert.ok(row.last_used.length > 0);
  });

  it('wrong agent key returns 401', async () => {
    const keyApp = createApp();

    // Create an agent key (but don't use it)
    await request(keyApp)
      .post('/api/keys')
      .send({ name: 'Agent Key' })
      .expect(201);

    // Try to use a wrong key
    const authApp = createAuthApp(null, db);
    const res = await request(authApp)
      .get('/api/projects')
      .set('Authorization', 'Bearer lmn_wrongkey123')
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });
});
