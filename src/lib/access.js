/**
 * Shared access-control helpers used by both the main app and route modules.
 *
 * Kept in a separate module to avoid a circular dependency between src/index.js
 * and the route files that need to enforce per-key project ownership.
 *
 * Exports:
 *   isAuthConfigured() -- true if admin key set OR any non-revoked agent key exists
 *   canAccessProject(req, projectId) -- ownership check respecting role + open mode
 */

const { db } = require('../db');

/**
 * Check if any authentication is configured. When no admin key is set and no
 * agent keys exist, Limoncello runs in "open mode" and all routes are public.
 */
function isAuthConfigured() {
  if (process.env.LIMONCELLO_API_KEY) return true;
  const row = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE revoked_at IS NULL').get();
  return row.count > 0;
}

/**
 * Check if the authenticated request can access a project.
 * - Open mode (no auth configured): always yes
 * - Admin key: always yes
 * - Agent key: only if the project's owner_key_id matches req.agentKeyId
 *
 * Returns true/false. Non-existent projects return false (so routes can return
 * 404 and avoid leaking project existence to unauthorized callers).
 */
function canAccessProject(req, projectId) {
  if (!isAuthConfigured()) return true;
  if (req.authRole === 'admin') return true;
  if (req.authRole !== 'agent' || !req.agentKeyId) return false;

  const row = db.prepare('SELECT owner_key_id FROM projects WHERE id = ?').get(projectId);
  if (!row) return false;
  return row.owner_key_id === req.agentKeyId;
}

module.exports = { isAuthConfigured, canAccessProject };
