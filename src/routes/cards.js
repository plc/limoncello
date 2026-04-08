/**
 * Card CRUD API Router
 *
 * Mounted at /api/projects/:projectId/cards (project-scoped)
 * and at /api/cards (compat shim via req._defaultProjectId).
 *
 * Uses mergeParams to access projectId from the parent router.
 * Status validation is dynamic -- checked against the project's columns.
 */

const express = require('express');
const { db } = require('../db');
const { cardId } = require('../lib/ids');
const { broadcast } = require('../ws');

const router = express.Router({ mergeParams: true });

/**
 * Helper: resolve projectId from route params or compat shim
 */
function resolveProjectId(req) {
  return req.params.projectId || req._defaultProjectId;
}

/**
 * Helper: parse tags JSON on a card object returned from DB.
 * Returns the card with tags as a JS array.
 */
function parseCardTags(card) {
  if (!card) return card;
  try {
    card.tags = JSON.parse(card.tags || '[]');
  } catch {
    card.tags = [];
  }
  return card;
}

/**
 * Helper: validate a tags value from request body.
 * Returns { valid: true, tags: [...] } or { valid: false, error: "..." }
 */
function validateTags(tags) {
  if (!Array.isArray(tags)) {
    return { valid: false, error: 'Tags must be an array' };
  }
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.trim() === '') {
      return { valid: false, error: 'Each tag must be a non-empty string' };
    }
  }
  return { valid: true, tags: tags.map(t => t.trim()) };
}

/**
 * Helper: Get the project's valid column keys
 */
function getProjectColumns(projectId) {
  const project = db.prepare('SELECT columns FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;
  return JSON.parse(project.columns);
}

/**
 * Helper: Get the next position for a given project + status column
 */
function getNextPosition(projectId, status) {
  const result = db.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM cards WHERE project_id = ? AND status = ?'
  ).get(projectId, status);
  return result.next_pos;
}

/**
 * Middleware: validate projectId exists and attach columns to req
 */
function validateProject(req, res, next) {
  const projectId = resolveProjectId(req);
  const columns = getProjectColumns(projectId);
  if (!columns) {
    return res.status(404).json({ error: 'Project not found' });
  }
  // Store resolved project info on req for use by route handlers
  req.projectId = projectId;
  req.projectColumns = columns;
  req.validStatuses = columns.map(c => c.key);

  // Build substatus map: status -> array of valid substatus keys
  req.substatusMap = {};
  for (const col of columns) {
    req.substatusMap[col.key] = (col.substatuses || []).map(s => s.key);
  }

  next();
}

router.use(validateProject);

/**
 * GET /changes
 * Get cards that have changed since a given timestamp.
 * Query params: ?since=<ISO8601>
 * Returns: { cards: [...], server_time: "2026-04-02T..." }
 */
router.get('/changes', (req, res) => {
  const { since } = req.query;

  if (!since || typeof since !== 'string') {
    return res.status(400).json({ error: 'Query param "since" is required and must be an ISO 8601 timestamp' });
  }

  // Validate ISO 8601 format
  const sinceDate = new Date(since);
  if (isNaN(sinceDate.getTime())) {
    return res.status(400).json({ error: 'Invalid ISO 8601 timestamp for "since" parameter' });
  }

  // Get cards that have been updated since the given timestamp
  // Use datetime() to ensure ISO 8601 timestamps are properly compared
  const cards = db.prepare(
    'SELECT * FROM cards WHERE project_id = ? AND updated_at > datetime(?) ORDER BY updated_at ASC'
  ).all(req.projectId, since).map(parseCardTags);

  const serverTime = new Date().toISOString();
  const changeCount = cards.length;

  // Set polling hint headers
  res.setHeader('X-Poll-Interval', '30'); // Suggested poll interval in seconds
  res.setHeader('X-Server-Time', serverTime);
  res.setHeader('X-Change-Count', changeCount.toString());

  res.json({
    cards,
    server_time: serverTime,
    polling: {
      next_since: serverTime,
      suggested_interval_seconds: 30,
      change_count: changeCount,
      hint: changeCount > 0
        ? 'Changes detected. Poll again to stay up to date.'
        : 'No changes since last poll. You can increase the interval if polling frequently.',
    },
  });
});

/**
 * GET /
 * List all cards for this project, ordered by column order then position.
 * Optional ?status= query param to filter by status.
 */
router.get('/', (req, res) => {
  const { status, tag } = req.query;

  if (status && !req.validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${req.validStatuses.join(', ')}` });
  }

  let query = 'SELECT * FROM cards WHERE project_id = ?';
  const params = [req.projectId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (tag) {
    query += " AND EXISTS (SELECT 1 FROM json_each(cards.tags) WHERE json_each.value = ?)";
    params.push(tag);
  }

  // Order by column position (using the project's column order), then card position
  const columnOrder = req.validStatuses.map((key, i) => `WHEN '${key}' THEN ${i}`).join(' ');
  query += ` ORDER BY CASE status ${columnOrder} END, position`;

  const cards = db.prepare(query).all(...params).map(parseCardTags);
  res.json(cards);
});

/**
 * POST /
 * Create a new card in this project.
 * Body: { title, description?, status?, substatus? }
 * Default status is the first column in the project.
 */
router.post('/', (req, res) => {
  const defaultStatus = req.validStatuses[0];
  const { title, description = '', status = defaultStatus, substatus, tags } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
  }

  if (!req.validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${req.validStatuses.join(', ')}` });
  }

  // Validate substatus if provided
  let validatedSubstatus = null;
  if (substatus !== undefined) {
    const validSubstatuses = req.substatusMap[status] || [];
    if (!validSubstatuses.includes(substatus)) {
      return res.status(400).json({
        error: `Invalid substatus "${substatus}" for status "${status}". Must be one of: ${validSubstatuses.join(', ') || 'none'}`
      });
    }
    validatedSubstatus = substatus;
  }

  // Validate tags if provided
  let validatedTags = '[]';
  if (tags !== undefined) {
    const result = validateTags(tags);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }
    validatedTags = JSON.stringify(result.tags);
  }

  const id = cardId();
  const position = getNextPosition(req.projectId, status);

  db.prepare(`
    INSERT INTO cards (id, project_id, title, description, status, substatus, tags, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, req.projectId, title.trim(), description, status, validatedSubstatus, validatedTags, position);

  const card = parseCardTags(db.prepare('SELECT * FROM cards WHERE id = ?').get(id));
  broadcast(req.projectId, { type: 'card_created', card });
  res.status(201).json(card);
});

/**
 * PATCH /reorder
 * Batch update card positions within this project.
 * Body: { cards: [{ id, position }] }
 */
router.patch('/reorder', (req, res) => {
  const { cards } = req.body;

  if (!Array.isArray(cards)) {
    return res.status(400).json({ error: 'Body must contain a "cards" array' });
  }

  const updateStmt = db.prepare("UPDATE cards SET position = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?");
  const updateMany = db.transaction((cardUpdates) => {
    for (const { id, position } of cardUpdates) {
      if (!id || typeof position !== 'number') {
        throw new Error('Each card must have id and position');
      }
      updateStmt.run(position, id, req.projectId);
    }
  });

  try {
    updateMany(cards);
    broadcast(req.projectId, { type: 'cards_reordered', cards });
    res.json({ updated: cards.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /:id
 * Get a single card by ID (must belong to this project).
 */
router.get('/:id', (req, res) => {
  const card = parseCardTags(db.prepare('SELECT * FROM cards WHERE id = ? AND project_id = ?').get(req.params.id, req.projectId));

  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.json(card);
});

/**
 * PATCH /:id
 * Partial update of a card.
 * Body can include: { title?, description?, status?, substatus?, position? }
 */
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, status, substatus, position, tags } = req.body;

  const existingCard = db.prepare('SELECT * FROM cards WHERE id = ? AND project_id = ?').get(id, req.projectId);
  if (!existingCard) {
    return res.status(404).json({ error: 'Card not found' });
  }

  if (status !== undefined && !req.validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${req.validStatuses.join(', ')}` });
  }

  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return res.status(400).json({ error: 'Title must be a non-empty string' });
  }

  const updates = [];
  const params = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title.trim());
  }

  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
  }

  // Handle status and substatus changes
  const statusChanging = status !== undefined && status !== existingCard.status;
  const targetStatus = status !== undefined ? status : existingCard.status;

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);

    if (statusChanging && position === undefined) {
      const nextPos = getNextPosition(req.projectId, status);
      updates.push('position = ?');
      params.push(nextPos);
    }
  }

  // Handle substatus updates
  if (statusChanging) {
    // Status is changing
    if (substatus !== undefined) {
      // Substatus explicitly provided, validate against NEW status
      const validSubstatuses = req.substatusMap[targetStatus] || [];
      if (substatus !== null && !validSubstatuses.includes(substatus)) {
        return res.status(400).json({
          error: `Invalid substatus "${substatus}" for status "${targetStatus}". Must be one of: ${validSubstatuses.join(', ') || 'none'}`
        });
      }
      updates.push('substatus = ?');
      params.push(substatus);
    } else {
      // Substatus not provided, auto-clear it
      updates.push('substatus = ?');
      params.push(null);
    }
  } else if (substatus !== undefined) {
    // Status not changing, but substatus is provided
    const validSubstatuses = req.substatusMap[targetStatus] || [];
    if (substatus !== null && !validSubstatuses.includes(substatus)) {
      return res.status(400).json({
        error: `Invalid substatus "${substatus}" for status "${targetStatus}". Must be one of: ${validSubstatuses.join(', ') || 'none'}`
      });
    }
    updates.push('substatus = ?');
    params.push(substatus);
  }

  if (tags !== undefined) {
    const result = validateTags(tags);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }
    updates.push('tags = ?');
    params.push(JSON.stringify(result.tags));
  }

  if (position !== undefined) {
    updates.push('position = ?');
    params.push(position);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updatedCard = parseCardTags(db.prepare('SELECT * FROM cards WHERE id = ?').get(id));
  broadcast(req.projectId, { type: 'card_updated', card: updatedCard });
  res.json(updatedCard);
});

/**
 * DELETE /:id
 * Delete a card.
 */
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM cards WHERE id = ? AND project_id = ?').run(req.params.id, req.projectId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  broadcast(req.projectId, { type: 'card_deleted', cardId: req.params.id });
  res.status(204).send();
});

module.exports = router;
