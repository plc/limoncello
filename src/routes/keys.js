/**
 * API Key management routes for agent bootstrapping.
 *
 * POST /api/keys   -- Create a new agent key (unauthenticated, rate-limited)
 * GET /api/keys    -- List all agent keys (admin only)
 * DELETE /api/keys/:id -- Revoke an agent key (admin only)
 */

const crypto = require('node:crypto');
const express = require('express');
const { db, DEFAULT_COLUMNS } = require('../db');
const { keyId, projectId, cardId } = require('../lib/ids');
const { WELCOME_TITLE, WELCOME_DESCRIPTION } = require('../lib/welcome');

const router = express.Router();

// Key format: lmn_ + 48 random alphanumeric characters
const KEY_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const KEY_LENGTH = 48;

function generateKeyPlaintext() {
  let key = 'lmn_';
  for (let i = 0; i < KEY_LENGTH; i++) {
    key += KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)];
  }
  return key;
}

function hashKey(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

// In-memory sliding window rate limiter: 10 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitStore = new Map(); // ip -> [timestamp, ...]

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = rateLimitStore.get(ip) || [];
  timestamps = timestamps.filter(t => t > cutoff);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }

  timestamps.push(now);
  rateLimitStore.set(ip, timestamps);
  next();
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of rateLimitStore) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      rateLimitStore.set(ip, filtered);
    }
  }
}, 5 * 60_000).unref();

/**
 * POST /api/keys
 * Create a new agent API key AND a private project owned by that key.
 * Unauthenticated but rate-limited. Since the call is zero-auth, the issued
 * key only sees the auto-created project (and any future projects the caller
 * creates) -- it cannot see pre-existing admin-owned projects on the instance.
 * Body: { name?: string }
 * Returns: { id, key, name, project_id, setup }  (key shown once)
 */
router.post('/', rateLimit, (req, res) => {
  const { name = '' } = req.body || {};

  if (name && typeof name !== 'string') {
    return res.status(400).json({ error: 'Name must be a string' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const id = keyId();
  const plaintext = generateKeyPlaintext();
  const hash = hashKey(plaintext);

  // Create key + private project + welcome card atomically so a caller
  // never ends up with a key that has no accessible project.
  const bootstrap = db.transaction(() => {
    db.prepare(`
      INSERT INTO api_keys (id, key_hash, name, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(id, hash, trimmedName);

    const pId = projectId();
    const projectName = trimmedName ? `${trimmedName} Board` : 'My Board';
    db.prepare(`
      INSERT INTO projects (id, name, description, columns, owner_key_id, created_at, updated_at)
      VALUES (?, ?, '', ?, ?, datetime('now'), datetime('now'))
    `).run(pId, projectName, DEFAULT_COLUMNS, id);

    // Welcome card in the first column (backlog)
    const firstColumnKey = JSON.parse(DEFAULT_COLUMNS)[0].key;
    db.prepare(`
      INSERT INTO cards (id, project_id, title, description, status, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(cardId(), pId, WELCOME_TITLE, WELCOME_DESCRIPTION, firstColumnKey);

    return pId;
  });

  const projectIdValue = bootstrap();

  res.status(201).json({
    id,
    key: plaintext,
    name: trimmedName,
    project_id: projectIdValue,
    setup: {
      warning: 'Save this key now -- it cannot be retrieved later.',
      note: 'This key has its own private board and cannot see projects owned by other keys.',
      mcp_command: `claude mcp add limoncello -s user --transport http --header "Authorization: Bearer ${plaintext}" -- https://limoncello.fly.dev/mcp`,
      env_var: `export LIMONCELLO_API_KEY=${plaintext}`,
      docs: 'https://limoncello.fly.dev/api/man'
    }
  });
});

/**
 * GET /api/keys
 * List all agent keys. Admin only (enforced by middleware in index.js).
 * Returns array of { id, name, created_at, last_used, revoked }
 */
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, name, created_at, last_used, revoked_at FROM api_keys ORDER BY created_at DESC').all();
  const keys = rows.map(row => ({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    last_used: row.last_used,
    revoked: row.revoked_at !== null,
  }));
  res.json(keys);
});

/**
 * DELETE /api/keys/:id
 * Revoke an agent key. Admin only.
 * Sets revoked_at timestamp (soft delete).
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const existing = db.prepare('SELECT id, revoked_at FROM api_keys WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Key not found' });
  }
  if (existing.revoked_at) {
    return res.status(400).json({ error: 'Key already revoked' });
  }

  db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?").run(id);
  res.status(204).send();
});

module.exports = router;
module.exports.hashKey = hashKey;
module.exports.rateLimitStore = rateLimitStore;
