/**
 * Card CRUD API Router
 *
 * Mounted at /api/cards in the main Express app.
 * Implements full Kanban card management with status columns and positioning.
 */

const express = require('express');
const { db } = require('../db');
const { cardId } = require('../lib/ids');

const router = express.Router();

const VALID_STATUSES = ['backlog', 'todo', 'in_progress', 'done'];

/**
 * Helper: Get the next position for a given status column
 */
function getNextPosition(status) {
  const result = db.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM cards WHERE status = ?'
  ).get(status);
  return result.next_pos;
}

/**
 * GET /api/cards
 * List all cards ordered by status then position.
 * Optional ?status= query param to filter by status.
 */
router.get('/', (req, res) => {
  const { status } = req.query;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: backlog, todo, in_progress, done' });
  }

  let query = 'SELECT * FROM cards';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY CASE status WHEN \'backlog\' THEN 1 WHEN \'todo\' THEN 2 WHEN \'in_progress\' THEN 3 WHEN \'done\' THEN 4 END, position';

  const cards = db.prepare(query).all(...params);
  res.json(cards);
});

/**
 * POST /api/cards
 * Create a new card.
 * Body: { title, description?, status? }
 * Title is required. Default status is 'backlog'.
 * Auto-assigns position = max(position) + 1 for that status column.
 */
router.post('/', (req, res) => {
  const { title, description = '', status = 'backlog' } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: backlog, todo, in_progress, done' });
  }

  const id = cardId();
  const position = getNextPosition(status);

  const stmt = db.prepare(`
    INSERT INTO cards (id, title, description, status, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  stmt.run(id, title.trim(), description, status, position);

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  res.status(201).json(card);
});

/**
 * PATCH /api/cards/reorder
 * Batch update card positions.
 * Body: { cards: [{ id, position }] }
 * Returns { updated: N }
 *
 * IMPORTANT: This route must be defined BEFORE /:id so Express doesn't match "reorder" as an id.
 */
router.patch('/reorder', (req, res) => {
  const { cards } = req.body;

  if (!Array.isArray(cards)) {
    return res.status(400).json({ error: 'Body must contain a "cards" array' });
  }

  const updateStmt = db.prepare('UPDATE cards SET position = ?, updated_at = datetime(\'now\') WHERE id = ?');
  const updateMany = db.transaction((cardUpdates) => {
    for (const { id, position } of cardUpdates) {
      if (!id || typeof position !== 'number') {
        throw new Error('Each card must have id and position');
      }
      updateStmt.run(position, id);
    }
  });

  try {
    updateMany(cards);
    res.json({ updated: cards.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/cards/:id
 * Get a single card by ID.
 * Returns 404 if not found.
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);

  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.json(card);
});

/**
 * PATCH /api/cards/:id
 * Partial update of a card.
 * Body can include: { title?, description?, status?, position? }
 * When status changes and no position is provided, auto-assigns position = max(position) + 1 in the new column.
 * Sets updated_at.
 * Returns 404 if not found.
 */
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, status, position } = req.body;

  const existingCard = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  if (!existingCard) {
    return res.status(404).json({ error: 'Card not found' });
  }

  // Validate status if provided
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: backlog, todo, in_progress, done' });
  }

  // Validate title if provided
  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return res.status(400).json({ error: 'Title must be a non-empty string' });
  }

  // Build dynamic update query
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

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);

    // If status changed and no position provided, auto-assign next position in new column
    if (status !== existingCard.status && position === undefined) {
      const nextPos = getNextPosition(status);
      updates.push('position = ?');
      params.push(nextPos);
    }
  }

  if (position !== undefined) {
    updates.push('position = ?');
    params.push(position);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.push('updated_at = datetime(\'now\')');
  params.push(id);

  const query = `UPDATE cards SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(query).run(...params);

  const updatedCard = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  res.json(updatedCard);
});

/**
 * DELETE /api/cards/:id
 * Delete a card.
 * Returns 204 on success.
 * Returns 404 if not found.
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.status(204).send();
});

module.exports = router;
