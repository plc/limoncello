/**
 * Project CRUD API Router
 *
 * Mounted at /api/projects in the main Express app.
 */

const express = require('express');
const { db, DEFAULT_COLUMNS } = require('../db');
const { projectId } = require('../lib/ids');

const router = express.Router();

/**
 * Validate and normalize substatuses in column definitions.
 * Returns { error } or { columns: normalizedColumns }
 */
function validateSubstatuses(columns) {
  const normalized = [];

  for (const col of columns) {
    const normalizedCol = { ...col };

    // Validate substatuses if present
    if (col.substatuses !== undefined) {
      if (!Array.isArray(col.substatuses)) {
        return { error: `Column "${col.key}" substatuses must be an array` };
      }

      const substatusKeys = new Set();
      for (const substatus of col.substatuses) {
        if (!substatus.key || !substatus.label) {
          return { error: `Each substatus in column "${col.key}" must have a key and label` };
        }
        if (!/^[a-z][a-z0-9_]*$/.test(substatus.key)) {
          return { error: `Invalid substatus key "${substatus.key}" in column "${col.key}". Use lowercase letters, numbers, and underscores.` };
        }
        if (substatusKeys.has(substatus.key)) {
          return { error: `Duplicate substatus key "${substatus.key}" in column "${col.key}"` };
        }
        substatusKeys.add(substatus.key);
      }

      normalizedCol.substatuses = col.substatuses;
    } else {
      // Normalize: set to empty array if not provided
      normalizedCol.substatuses = [];
    }

    normalized.push(normalizedCol);
  }

  return { columns: normalized };
}

/**
 * GET /api/projects
 * List all projects.
 */
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at').all();
  res.json(projects.map(p => ({ ...p, columns: JSON.parse(p.columns) })));
});

/**
 * POST /api/projects
 * Create a new project.
 * Body: { name, description?, columns? }
 */
router.post('/', (req, res) => {
  const { name, description, columns } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required and must be a non-empty string' });
  }

  if (description !== undefined && typeof description !== 'string') {
    return res.status(400).json({ error: 'Description must be a string' });
  }

  let normalizedColumns = null;

  if (columns !== undefined) {
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: 'Columns must be a non-empty array' });
    }
    for (const col of columns) {
      if (!col.key || !col.label) {
        return res.status(400).json({ error: 'Each column must have a key and label' });
      }
      if (!/^[a-z][a-z0-9_]*$/.test(col.key)) {
        return res.status(400).json({ error: `Invalid column key "${col.key}". Use lowercase letters, numbers, and underscores.` });
      }
    }
    const keys = columns.map(c => c.key);
    if (new Set(keys).size !== keys.length) {
      return res.status(400).json({ error: 'Column keys must be unique' });
    }

    // Validate and normalize substatuses
    const result = validateSubstatuses(columns);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    normalizedColumns = result.columns;
  }

  const id = projectId();
  const columnsJson = normalizedColumns ? JSON.stringify(normalizedColumns) : DEFAULT_COLUMNS;
  const desc = description !== undefined ? description.trim() : '';

  db.prepare(`
    INSERT INTO projects (id, name, description, columns, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, name.trim(), desc, columnsJson);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json({ ...project, columns: JSON.parse(project.columns) });
});

/**
 * GET /api/projects/:id
 * Get a single project.
 */
router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json({ ...project, columns: JSON.parse(project.columns) });
});

/**
 * PATCH /api/projects/:id
 * Update a project's name, description, and/or columns.
 * Rejects column removal if cards use that status.
 */
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, columns } = req.body;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    return res.status(400).json({ error: 'Name must be a non-empty string' });
  }

  if (description !== undefined && typeof description !== 'string') {
    return res.status(400).json({ error: 'Description must be a string' });
  }

  let normalizedColumns = null;

  if (columns !== undefined) {
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: 'Columns must be a non-empty array' });
    }
    for (const col of columns) {
      if (!col.key || !col.label) {
        return res.status(400).json({ error: 'Each column must have a key and label' });
      }
      if (!/^[a-z][a-z0-9_]*$/.test(col.key)) {
        return res.status(400).json({ error: `Invalid column key "${col.key}". Use lowercase letters, numbers, and underscores.` });
      }
    }
    const keys = columns.map(c => c.key);
    if (new Set(keys).size !== keys.length) {
      return res.status(400).json({ error: 'Column keys must be unique' });
    }

    // Validate and normalize substatuses
    const result = validateSubstatuses(columns);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    normalizedColumns = result.columns;

    // Check for removed columns that have cards
    const currentColumns = JSON.parse(project.columns);
    const newKeys = new Set(keys);
    for (const col of currentColumns) {
      if (!newKeys.has(col.key)) {
        const count = db.prepare(
          'SELECT count(*) as n FROM cards WHERE project_id = ? AND status = ?'
        ).get(id, col.key).n;
        if (count > 0) {
          return res.status(400).json({
            error: `Cannot remove column "${col.label}" -- it has ${count} card(s). Move or delete them first.`
          });
        }
      }
    }

    // Clear substatuses when a column's substatuses are modified
    for (const newCol of normalizedColumns) {
      const oldCol = currentColumns.find(c => c.key === newCol.key);
      if (oldCol) {
        const oldSubstatusKeys = new Set((oldCol.substatuses || []).map(s => s.key));
        const newSubstatusKeys = new Set(newCol.substatuses.map(s => s.key));
        const removedSubstatuses = [];

        for (const oldKey of oldSubstatusKeys) {
          if (!newSubstatusKeys.has(oldKey)) {
            removedSubstatuses.push(oldKey);
          }
        }

        if (removedSubstatuses.length > 0) {
          const placeholders = removedSubstatuses.map(() => '?').join(', ');
          db.prepare(
            `UPDATE cards SET substatus = NULL WHERE project_id = ? AND status = ? AND substatus IN (${placeholders})`
          ).run(id, newCol.key, ...removedSubstatuses);
        }
      }
    }
  }

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name.trim());
  }

  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description.trim());
  }

  if (normalizedColumns !== null) {
    updates.push('columns = ?');
    params.push(JSON.stringify(normalizedColumns));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.json({ ...updated, columns: JSON.parse(updated.columns) });
});

/**
 * DELETE /api/projects/:id
 * Delete a project. Rejects if it has cards.
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const cardCount = db.prepare('SELECT count(*) as n FROM cards WHERE project_id = ?').get(id).n;
  if (cardCount > 0) {
    return res.status(400).json({
      error: `Cannot delete project "${project.name}" -- it has ${cardCount} card(s). Delete them first.`
    });
  }

  // Prevent deleting the last project
  const projectCount = db.prepare('SELECT count(*) as n FROM projects').get().n;
  if (projectCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last project' });
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
