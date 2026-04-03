/**
 * Homepage and board route tests
 *
 * Tests that:
 * - / serves the new homepage (not the board)
 * - /board serves the Kanban board HTML
 * - Both are accessible without auth
 * - Homepage contains expected links and content
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const path = require('path');

function createApp() {
  const app = express();
  app.use(express.static(path.join(__dirname, '../src/public')));
  app.get('/board', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/public/board.html'));
  });
  return app;
}

describe('Homepage - GET /', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  it('returns 200', async () => {
    await request(app).get('/').expect(200);
  });

  it('returns HTML', async () => {
    const res = await request(app).get('/').expect(200);
    assert.ok(res.headers['content-type'].includes('text/html'));
  });

  it('contains a link to /api/man', async () => {
    const res = await request(app).get('/');
    assert.ok(res.text.includes('/api/man'), 'homepage should link to /api/man');
  });

  it('contains a link to /board', async () => {
    const res = await request(app).get('/');
    assert.ok(res.text.includes('/board'), 'homepage should link to /board');
  });

  it('contains the Limoncello title', async () => {
    const res = await request(app).get('/');
    assert.ok(res.text.includes('Limoncello'), 'homepage should contain Limoncello title');
  });

  it('contains the For Agents section', async () => {
    const res = await request(app).get('/');
    assert.ok(res.text.includes('For Agents'), 'homepage should have For Agents section');
  });

  it('contains the For Humans section', async () => {
    const res = await request(app).get('/');
    assert.ok(res.text.includes('For Humans'), 'homepage should have For Humans section');
  });

  it('does not contain the board app.js script', async () => {
    const res = await request(app).get('/');
    assert.ok(!res.text.includes('<script src="app.js">'), 'homepage should not load app.js');
  });
});

describe('Board - GET /board', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  it('returns 200', async () => {
    await request(app).get('/board').expect(200);
  });

  it('returns HTML', async () => {
    const res = await request(app).get('/board').expect(200);
    assert.ok(res.headers['content-type'].includes('text/html'));
  });

  it('contains the board element', async () => {
    const res = await request(app).get('/board');
    assert.ok(res.text.includes('id="board"'), 'board page should contain the board element');
  });

  it('loads app.js', async () => {
    const res = await request(app).get('/board');
    assert.ok(res.text.includes('app.js'), 'board page should load app.js');
  });

  it('loads style.css', async () => {
    const res = await request(app).get('/board');
    assert.ok(res.text.includes('style.css'), 'board page should load style.css');
  });
});

describe('Board - GET /board.html (static fallback)', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  it('returns 200 via static middleware', async () => {
    await request(app).get('/board.html').expect(200);
  });

  it('returns the same content as /board', async () => {
    const boardRes = await request(app).get('/board');
    const staticRes = await request(app).get('/board.html');
    assert.equal(boardRes.text, staticRes.text);
  });
});

describe('Auth - Homepage and board accessible without auth', () => {
  it('homepage accessible when auth is configured', async () => {
    const apiKey = 'test-secret-key';
    const app = express();
    app.use(express.static(path.join(__dirname, '../src/public')));
    app.get('/board', (req, res) => {
      res.sendFile(path.join(__dirname, '../src/public/board.html'));
    });

    function requireAuth(req, res, next) {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${apiKey}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    }

    app.get('/api/projects', requireAuth, (req, res) => {
      res.json({ projects: [] });
    });

    // Homepage accessible without auth
    await request(app).get('/').expect(200);
    // Board accessible without auth
    await request(app).get('/board').expect(200);
    // API still requires auth
    await request(app).get('/api/projects').expect(401);
  });
});
