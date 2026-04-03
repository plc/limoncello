/**
 * Authentication middleware tests
 *
 * Tests the Bearer token authentication middleware for:
 * - Requests passing through when no API key is set
 * - Requests requiring valid Bearer token when API key is set
 * - Public endpoints (health, static files) remaining accessible
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const path = require('path');

/**
 * Create an Express app with auth middleware.
 * Mirrors the auth logic from src/index.js.
 */
function createAuthApp(apiKey = null) {
  const app = express();
  app.use(express.json());

  // Auth middleware
  function requireAuth(req, res, next) {
    if (!apiKey) return next();
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${apiKey}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  // Static files (before auth)
  app.use(express.static(path.join(__dirname, '../src/public')));

  // Health check (before auth)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Protected API routes
  app.get('/api/projects', requireAuth, (req, res) => {
    res.json({ projects: [] });
  });

  app.post('/api/cards', requireAuth, (req, res) => {
    res.status(201).json({ id: 'crd_test', title: req.body.title });
  });

  return app;
}

describe('Auth Middleware - No API Key', () => {
  let app;

  beforeEach(() => {
    app = createAuthApp(null);
  });

  it('allows requests without auth header', async () => {
    const res = await request(app)
      .get('/api/projects')
      .expect(200);

    assert.deepEqual(res.body, { projects: [] });
  });

  it('allows POST requests without auth header', async () => {
    const res = await request(app)
      .post('/api/cards')
      .send({ title: 'Test card' })
      .expect(201);

    assert.equal(res.body.title, 'Test card');
  });

  it('allows health endpoint without auth', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.timestamp);
  });
});

describe('Auth Middleware - API Key Set', () => {
  let app;
  const apiKey = 'test-secret-key-xyz';

  beforeEach(() => {
    app = createAuthApp(apiKey);
  });

  it('allows requests with valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    assert.deepEqual(res.body, { projects: [] });
  });

  it('allows POST requests with valid Bearer token', async () => {
    const res = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ title: 'Authenticated card' })
      .expect(201);

    assert.equal(res.body.title, 'Authenticated card');
  });

  it('rejects requests without auth header', async () => {
    const res = await request(app)
      .get('/api/projects')
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('rejects POST requests without auth header', async () => {
    const res = await request(app)
      .post('/api/cards')
      .send({ title: 'Unauthorized card' })
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('rejects requests with wrong token', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('rejects requests with malformed Authorization header (no Bearer)', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', apiKey)
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('rejects requests with malformed Authorization header (Basic auth)', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Basic ${Buffer.from(`user:${apiKey}`).toString('base64')}`)
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('allows health endpoint without auth', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    assert.equal(res.body.status, 'ok');
  });

  it('allows static files without auth', async () => {
    // Try to access the main UI file
    const res = await request(app)
      .get('/index.html')
      .expect(200);

    // Should return HTML content
    assert.ok(res.text.includes('<!DOCTYPE html>') || res.text.includes('<html'));
  });

  it('rejects requests with empty Bearer token', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer ')
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('rejects requests with extra spaces in Bearer token', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer  ${apiKey}`)
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });
});

describe('Auth Middleware - Case Sensitivity', () => {
  let app;
  const apiKey = 'CaseSensitiveKey123';

  beforeEach(() => {
    app = createAuthApp(apiKey);
  });

  it('requires exact case match for API key', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer casesensitivekey123`)
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('accepts exact case match', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    assert.deepEqual(res.body, { projects: [] });
  });
});

describe('Auth Middleware - Special Characters', () => {
  let app;
  const apiKey = 'key-with-special_chars.123!@#$%';

  beforeEach(() => {
    app = createAuthApp(apiKey);
  });

  it('handles API keys with special characters', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);

    assert.deepEqual(res.body, { projects: [] });
  });

  it('rejects partial match of special character key', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer key-with-special_chars.123')
      .expect(401);

    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });
});

describe('API Key Format Guard - Stripe-like keys rejected', () => {
  // The guard is in src/index.js and calls process.exit(1) on startup.
  // We test the regex directly since we can't easily test process.exit in-process.
  const STRIPE_PATTERN = /^(sk|pk|rk)_(live|test)_/i;

  it('rejects sk_live_ prefix', () => {
    assert.ok(STRIPE_PATTERN.test('sk_live_abc123'));
  });

  it('rejects sk_test_ prefix', () => {
    assert.ok(STRIPE_PATTERN.test('sk_test_abc123'));
  });

  it('rejects pk_live_ prefix', () => {
    assert.ok(STRIPE_PATTERN.test('pk_live_abc123'));
  });

  it('rejects pk_test_ prefix', () => {
    assert.ok(STRIPE_PATTERN.test('pk_test_abc123'));
  });

  it('rejects rk_live_ prefix', () => {
    assert.ok(STRIPE_PATTERN.test('rk_live_abc123'));
  });

  it('rejects rk_test_ prefix', () => {
    assert.ok(STRIPE_PATTERN.test('rk_test_abc123'));
  });

  it('rejects case-insensitive match', () => {
    assert.ok(STRIPE_PATTERN.test('SK_LIVE_ABC123'));
    assert.ok(STRIPE_PATTERN.test('Sk_Test_abc'));
  });

  it('allows normal API keys', () => {
    assert.ok(!STRIPE_PATTERN.test('my-limoncello-key-123'));
    assert.ok(!STRIPE_PATTERN.test('a1b2c3d4e5f6'));
    assert.ok(!STRIPE_PATTERN.test('limoncello_production_key'));
  });
});
