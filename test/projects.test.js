/**
 * Tests for Projects API (GET, POST, PATCH, DELETE /api/projects)
 *
 * Run with: node --test test/projects.test.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp, resetDb, getDefaultProject, db } = require('./helpers');

describe('Projects API', () => {
  let app;
  let agent;
  let defaultProjectId;

  beforeEach(() => {
    app = createApp();
    agent = request(app);
    defaultProjectId = resetDb();
  });

  describe('GET /api/projects', () => {
    it('returns array of projects', async () => {
      const res = await agent.get('/api/projects').expect(200);
      assert.ok(Array.isArray(res.body), 'Response should be an array');
      assert.equal(res.body.length, 1, 'Should have exactly one project after resetDb');
    });

    it('default project exists after resetDb', async () => {
      const res = await agent.get('/api/projects').expect(200);
      const defaultProject = res.body[0];
      assert.equal(defaultProject.id, defaultProjectId);
      assert.equal(defaultProject.name, 'Default');
    });

    it('returns parsed columns (not JSON string)', async () => {
      const res = await agent.get('/api/projects').expect(200);
      const project = res.body[0];
      assert.ok(Array.isArray(project.columns), 'columns should be parsed array');
      assert.ok(project.columns.length > 0, 'columns should not be empty');
      assert.equal(typeof project.columns[0].key, 'string');
      assert.equal(typeof project.columns[0].label, 'string');
    });

    it('returns multiple projects in creation order', async () => {
      // Create additional projects
      await agent.post('/api/projects').send({ name: 'Project A' });
      await agent.post('/api/projects').send({ name: 'Project B' });

      const res = await agent.get('/api/projects').expect(200);
      assert.equal(res.body.length, 3);
      assert.equal(res.body[0].name, 'Default');
      assert.equal(res.body[1].name, 'Project A');
      assert.equal(res.body[2].name, 'Project B');
    });
  });

  describe('POST /api/projects', () => {
    it('creates project with default columns when columns not provided', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: 'My Project' })
        .expect(201);

      assert.equal(res.body.name, 'My Project');
      assert.ok(Array.isArray(res.body.columns));
      assert.ok(res.body.columns.length >= 5, 'Should have default columns');

      // Verify default columns are present
      const keys = res.body.columns.map(c => c.key);
      assert.ok(keys.includes('backlog'));
      assert.ok(keys.includes('todo'));
      assert.ok(keys.includes('in_progress'));
      assert.ok(keys.includes('blocked'));
      assert.ok(keys.includes('done'));
    });

    it('creates project with custom columns', async () => {
      const customColumns = [
        { key: 'new', label: 'New' },
        { key: 'active', label: 'Active' },
        { key: 'complete', label: 'Complete' }
      ];

      const res = await agent
        .post('/api/projects')
        .send({ name: 'Custom Project', columns: customColumns })
        .expect(201);

      assert.equal(res.body.name, 'Custom Project');
      assert.equal(res.body.columns.length, 3);
      assert.equal(res.body.columns[0].key, 'new');
      assert.equal(res.body.columns[1].key, 'active');
      assert.equal(res.body.columns[2].key, 'complete');
    });

    it('creates project with substatuses on columns', async () => {
      const columnsWithSubstatuses = [
        { key: 'todo', label: 'To Do', substatuses: [] },
        {
          key: 'review',
          label: 'In Review',
          substatuses: [
            { key: 'code_review', label: 'Code Review' },
            { key: 'qa_review', label: 'QA Review' }
          ]
        },
        { key: 'done', label: 'Done', substatuses: [] }
      ];

      const res = await agent
        .post('/api/projects')
        .send({ name: 'Review Project', columns: columnsWithSubstatuses })
        .expect(201);

      assert.equal(res.body.columns.length, 3);
      const reviewColumn = res.body.columns.find(c => c.key === 'review');
      assert.ok(reviewColumn);
      assert.equal(reviewColumn.substatuses.length, 2);
      assert.equal(reviewColumn.substatuses[0].key, 'code_review');
      assert.equal(reviewColumn.substatuses[1].key, 'qa_review');
    });

    it('normalizes columns without substatuses to have empty array', async () => {
      const columns = [
        { key: 'todo', label: 'To Do' }
      ];

      const res = await agent
        .post('/api/projects')
        .send({ name: 'Normalized Project', columns })
        .expect(201);

      assert.ok(Array.isArray(res.body.columns[0].substatuses));
      assert.equal(res.body.columns[0].substatuses.length, 0);
    });

    it('rejects empty name', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: '' })
        .expect(400);

      assert.ok(res.body.error.includes('Name is required'));
    });

    it('rejects whitespace-only name', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: '   ' })
        .expect(400);

      assert.ok(res.body.error.includes('Name is required'));
    });

    it('rejects non-string name', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: 123 })
        .expect(400);

      assert.ok(res.body.error.includes('Name is required'));
    });

    it('rejects missing name', async () => {
      const res = await agent
        .post('/api/projects')
        .send({})
        .expect(400);

      assert.ok(res.body.error.includes('Name is required'));
    });

    it('rejects empty columns array', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: 'Project', columns: [] })
        .expect(400);

      assert.ok(res.body.error.includes('non-empty array'));
    });

    it('rejects columns without key', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [{ label: 'Missing Key' }]
        })
        .expect(400);

      assert.ok(res.body.error.includes('must have a key and label'));
    });

    it('rejects columns without label', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [{ key: 'missing_label' }]
        })
        .expect(400);

      assert.ok(res.body.error.includes('must have a key and label'));
    });

    it('rejects invalid column key format (uppercase)', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [{ key: 'TODO', label: 'To Do' }]
        })
        .expect(400);

      assert.ok(res.body.error.includes('Invalid column key'));
      assert.ok(res.body.error.includes('TODO'));
    });

    it('rejects invalid column key format (spaces)', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [{ key: 'to do', label: 'To Do' }]
        })
        .expect(400);

      assert.ok(res.body.error.includes('Invalid column key'));
    });

    it('rejects invalid column key format (starting with number)', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [{ key: '1_todo', label: 'To Do' }]
        })
        .expect(400);

      assert.ok(res.body.error.includes('Invalid column key'));
    });

    it('rejects invalid column key format (hyphens)', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [{ key: 'to-do', label: 'To Do' }]
        })
        .expect(400);

      assert.ok(res.body.error.includes('Invalid column key'));
    });

    it('accepts valid column key formats', async () => {
      const columns = [
        { key: 'a', label: 'A' },
        { key: 'todo', label: 'To Do' },
        { key: 'in_progress', label: 'In Progress' },
        { key: 'todo_2', label: 'To Do 2' },
        { key: 'a1b2c3', label: 'Mixed' }
      ];

      const res = await agent
        .post('/api/projects')
        .send({ name: 'Project', columns })
        .expect(201);

      assert.equal(res.body.columns.length, 5);
    });

    it('rejects duplicate column keys', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [
            { key: 'todo', label: 'To Do' },
            { key: 'todo', label: 'Also To Do' }
          ]
        })
        .expect(400);

      assert.ok(res.body.error.includes('Column keys must be unique'));
    });

    it('rejects invalid substatus key format', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [
            {
              key: 'blocked',
              label: 'Blocked',
              substatuses: [{ key: 'INVALID-KEY', label: 'Invalid' }]
            }
          ]
        })
        .expect(400);

      assert.ok(res.body.error.includes('Invalid substatus key'));
      assert.ok(res.body.error.includes('INVALID-KEY'));
    });

    it('rejects duplicate substatus keys within a column', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [
            {
              key: 'blocked',
              label: 'Blocked',
              substatuses: [
                { key: 'review', label: 'Review' },
                { key: 'review', label: 'Also Review' }
              ]
            }
          ]
        })
        .expect(400);

      assert.ok(res.body.error.includes('Duplicate substatus key'));
      assert.ok(res.body.error.includes('review'));
    });

    it('rejects substatus without key', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [
            {
              key: 'blocked',
              label: 'Blocked',
              substatuses: [{ label: 'Missing Key' }]
            }
          ]
        })
        .expect(400);

      assert.ok(res.body.error.includes('must have a key and label'));
    });

    it('rejects substatus without label', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [
            {
              key: 'blocked',
              label: 'Blocked',
              substatuses: [{ key: 'missing_label' }]
            }
          ]
        })
        .expect(400);

      assert.ok(res.body.error.includes('must have a key and label'));
    });

    it('rejects substatuses that are not an array', async () => {
      const res = await agent
        .post('/api/projects')
        .send({
          name: 'Project',
          columns: [
            {
              key: 'blocked',
              label: 'Blocked',
              substatuses: 'not an array'
            }
          ]
        })
        .expect(400);

      assert.ok(res.body.error.includes('substatuses must be an array'));
    });

    it('returns 201 with created project', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: 'New Project' })
        .expect(201);

      assert.equal(res.body.name, 'New Project');
      assert.ok(res.body.id);
      assert.ok(res.body.created_at);
      assert.ok(res.body.updated_at);
    });

    it('created project has prj_ prefixed ID', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: 'Test Project' })
        .expect(201);

      assert.ok(res.body.id.startsWith('prj_'));
    });

    it('trims whitespace from project name', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: '  Trimmed Project  ' })
        .expect(201);

      assert.equal(res.body.name, 'Trimmed Project');
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns project by ID', async () => {
      const res = await agent
        .get(`/api/projects/${defaultProjectId}`)
        .expect(200);

      assert.equal(res.body.id, defaultProjectId);
      assert.equal(res.body.name, 'Default');
      assert.ok(Array.isArray(res.body.columns));
    });

    it('returns 404 for non-existent ID', async () => {
      const res = await agent
        .get('/api/projects/prj_nonexistent')
        .expect(404);

      assert.ok(res.body.error.includes('not found'));
    });

    it('returns parsed columns', async () => {
      const res = await agent
        .get(`/api/projects/${defaultProjectId}`)
        .expect(200);

      assert.ok(Array.isArray(res.body.columns));
      assert.equal(typeof res.body.columns[0].key, 'string');
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('updates project name', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      assert.equal(res.body.name, 'Updated Name');
      assert.equal(res.body.id, defaultProjectId);
    });

    it('updates project columns', async () => {
      const newColumns = [
        { key: 'open', label: 'Open' },
        { key: 'closed', label: 'Closed' }
      ];

      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ columns: newColumns })
        .expect(200);

      assert.equal(res.body.columns.length, 2);
      assert.equal(res.body.columns[0].key, 'open');
      assert.equal(res.body.columns[1].key, 'closed');
    });

    it('updates both name and columns', async () => {
      const newColumns = [{ key: 'todo', label: 'To Do' }];

      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ name: 'Both Updated', columns: newColumns })
        .expect(200);

      assert.equal(res.body.name, 'Both Updated');
      assert.equal(res.body.columns.length, 1);
    });

    it('rejects removing column that has cards', async () => {
      // Create a card in the 'backlog' status
      db.prepare(`
        INSERT INTO cards (id, project_id, title, status, created_at, updated_at)
        VALUES ('crd_test', ?, 'Test Card', 'backlog', datetime('now'), datetime('now'))
      `).run(defaultProjectId);

      // Try to remove the 'backlog' column
      const newColumns = [
        { key: 'todo', label: 'To Do' },
        { key: 'done', label: 'Done' }
      ];

      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ columns: newColumns })
        .expect(400);

      assert.ok(res.body.error.includes('Cannot remove column'));
      assert.ok(res.body.error.includes('Backlog'));
      assert.ok(res.body.error.includes('1 card'));
    });

    it('allows removing column that has no cards', async () => {
      // Ensure no cards in backlog
      const newColumns = [
        { key: 'todo', label: 'To Do' },
        { key: 'done', label: 'Done' }
      ];

      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ columns: newColumns })
        .expect(200);

      assert.equal(res.body.columns.length, 2);
    });

    it('clears card substatuses when substatus is removed from column definition', async () => {
      // Create a card with a substatus
      db.prepare(`
        INSERT INTO cards (id, project_id, title, status, substatus, created_at, updated_at)
        VALUES ('crd_test', ?, 'Test Card', 'blocked', 'human_review', datetime('now'), datetime('now'))
      `).run(defaultProjectId);

      // Verify card has substatus
      let card = db.prepare('SELECT * FROM cards WHERE id = ?').get('crd_test');
      assert.equal(card.substatus, 'human_review');

      // Update project to remove human_review substatus from blocked column
      const currentProject = getDefaultProject();
      const updatedColumns = currentProject.columns.map(col => {
        if (col.key === 'blocked') {
          return {
            ...col,
            substatuses: [{ key: 'agent_review', label: 'Agent Review' }]
          };
        }
        return col;
      });

      await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ columns: updatedColumns })
        .expect(200);

      // Verify card substatus was cleared
      card = db.prepare('SELECT * FROM cards WHERE id = ?').get('crd_test');
      assert.equal(card.substatus, null);
    });

    it('preserves card substatuses when substatus still exists in column definition', async () => {
      // Create a card with a substatus
      db.prepare(`
        INSERT INTO cards (id, project_id, title, status, substatus, created_at, updated_at)
        VALUES ('crd_test', ?, 'Test Card', 'blocked', 'human_review', datetime('now'), datetime('now'))
      `).run(defaultProjectId);

      // Update project but keep human_review substatus
      const currentProject = getDefaultProject();
      const updatedColumns = currentProject.columns.map(col => {
        if (col.key === 'blocked') {
          return {
            ...col,
            substatuses: [
              { key: 'human_review', label: 'Human Review' },
              { key: 'new_substatus', label: 'New Substatus' }
            ]
          };
        }
        return col;
      });

      await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ columns: updatedColumns })
        .expect(200);

      // Verify card substatus was preserved
      const card = db.prepare('SELECT * FROM cards WHERE id = ?').get('crd_test');
      assert.equal(card.substatus, 'human_review');
    });

    it('rejects empty name', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ name: '' })
        .expect(400);

      assert.ok(res.body.error.includes('Name must be a non-empty string'));
    });

    it('rejects whitespace-only name', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ name: '   ' })
        .expect(400);

      assert.ok(res.body.error.includes('Name must be a non-empty string'));
    });

    it('rejects non-string name', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ name: 123 })
        .expect(400);

      assert.ok(res.body.error.includes('Name must be a non-empty string'));
    });

    it('returns 404 for non-existent ID', async () => {
      const res = await agent
        .patch('/api/projects/prj_nonexistent')
        .send({ name: 'Updated' })
        .expect(404);

      assert.ok(res.body.error.includes('not found'));
    });

    it('rejects no valid fields', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({})
        .expect(400);

      assert.ok(res.body.error.includes('No valid fields to update'));
    });

    it('rejects invalid fields only', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ invalid_field: 'value' })
        .expect(400);

      assert.ok(res.body.error.includes('No valid fields to update'));
    });

    it('trims whitespace from updated name', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ name: '  Trimmed  ' })
        .expect(200);

      assert.equal(res.body.name, 'Trimmed');
    });

    it('validates column format on update', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ columns: [{ key: 'INVALID', label: 'Invalid' }] })
        .expect(400);

      assert.ok(res.body.error.includes('Invalid column key'));
    });

    it('validates substatus format on update', async () => {
      const res = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({
          columns: [
            {
              key: 'blocked',
              label: 'Blocked',
              substatuses: [{ key: 'INVALID-KEY', label: 'Invalid' }]
            }
          ]
        })
        .expect(400);

      assert.ok(res.body.error.includes('Invalid substatus key'));
    });
  });

  describe('DELETE /api/projects/:id', () => {
    let emptyProjectId;

    beforeEach(async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: 'Empty Project' });
      emptyProjectId = res.body.id;

      // Delete the auto-created welcome card to make project truly empty
      db.exec(`DELETE FROM cards WHERE project_id = '${emptyProjectId}'`);
    });

    it('deletes empty project', async () => {
      await agent.delete(`/api/projects/${emptyProjectId}`).expect(204);

      // Verify project is gone
      await agent.get(`/api/projects/${emptyProjectId}`).expect(404);
    });

    it('rejects deleting project with cards', async () => {
      // Re-add a card to the empty project
      db.prepare(`
        INSERT INTO cards (id, project_id, title, status, created_at, updated_at)
        VALUES ('crd_test', ?, 'Test Card', 'backlog', datetime('now'), datetime('now'))
      `).run(emptyProjectId);

      const res = await agent
        .delete(`/api/projects/${emptyProjectId}`)
        .expect(400);

      assert.ok(res.body.error.includes('Cannot delete project'));
      assert.ok(res.body.error.includes('1 card'));
    });

    it('includes correct card count in error message', async () => {
      // Add multiple cards
      for (let i = 0; i < 3; i++) {
        db.prepare(`
          INSERT INTO cards (id, project_id, title, status, created_at, updated_at)
          VALUES (?, ?, ?, 'backlog', datetime('now'), datetime('now'))
        `).run(`crd_test_${i}`, emptyProjectId, `Test Card ${i}`);
      }

      const res = await agent
        .delete(`/api/projects/${emptyProjectId}`)
        .expect(400);

      assert.ok(res.body.error.includes('3 card'));
    });

    it('rejects deleting last project', async () => {
      // Delete the empty project first
      await agent.delete(`/api/projects/${emptyProjectId}`).expect(204);

      // Try to delete the last remaining project (Default)
      const res = await agent
        .delete(`/api/projects/${defaultProjectId}`)
        .expect(400);

      assert.ok(res.body.error.includes('Cannot delete the last project'));
    });

    it('returns 404 for non-existent ID', async () => {
      const res = await agent
        .delete('/api/projects/prj_nonexistent')
        .expect(404);

      assert.ok(res.body.error.includes('not found'));
    });

    it('returns 204 on success', async () => {
      const res = await agent.delete(`/api/projects/${emptyProjectId}`);

      assert.equal(res.status, 204);
      assert.equal(res.text, '');
    });

    it('allows deleting one of multiple projects', async () => {
      // Create a third project
      const res = await agent
        .post('/api/projects')
        .send({ name: 'Third Project' });
      const thirdProjectId = res.body.id;

      // Should be able to delete the empty project
      await agent.delete(`/api/projects/${emptyProjectId}`).expect(204);

      // Verify we still have two projects
      const listRes = await agent.get('/api/projects').expect(200);
      assert.equal(listRes.body.length, 2);
      assert.equal(listRes.body[0].id, defaultProjectId);
      assert.equal(listRes.body[1].id, thirdProjectId);
    });
  });

  describe('Edge cases and integration', () => {
    it('handles project with many columns', async () => {
      const manyColumns = Array.from({ length: 20 }, (_, i) => ({
        key: `col_${i}`,
        label: `Column ${i}`
      }));

      const res = await agent
        .post('/api/projects')
        .send({ name: 'Many Columns', columns: manyColumns })
        .expect(201);

      assert.equal(res.body.columns.length, 20);
    });

    it('handles project with complex substatuses', async () => {
      const columns = [
        {
          key: 'workflow',
          label: 'Workflow',
          substatuses: Array.from({ length: 10 }, (_, i) => ({
            key: `step_${i}`,
            label: `Step ${i}`
          }))
        }
      ];

      const res = await agent
        .post('/api/projects')
        .send({ name: 'Complex', columns })
        .expect(201);

      assert.equal(res.body.columns[0].substatuses.length, 10);
    });

    it('handles unicode in project names', async () => {
      const res = await agent
        .post('/api/projects')
        .send({ name: '项目名称 🚀' })
        .expect(201);

      assert.equal(res.body.name, '项目名称 🚀');
    });

    it('handles unicode in column labels', async () => {
      const columns = [
        { key: 'todo', label: '待办 📝' },
        { key: 'done', label: '完成 ✅' }
      ];

      const res = await agent
        .post('/api/projects')
        .send({ name: 'Unicode Project', columns })
        .expect(201);

      assert.equal(res.body.columns[0].label, '待办 📝');
      assert.equal(res.body.columns[1].label, '完成 ✅');
    });

    it('updated_at changes on PATCH', async () => {
      // Create a project with an old timestamp directly in the database
      const projectId = 'prj_test_timestamp';
      const oldTimestamp = '2020-01-01 00:00:00';
      db.prepare(`
        INSERT INTO projects (id, name, columns, created_at, updated_at)
        VALUES (?, 'Test Timestamps', ?, ?, ?)
      `).run(projectId, JSON.stringify([{ key: 'todo', label: 'To Do', substatuses: [] }]), oldTimestamp, oldTimestamp);

      // Now update the project
      const updated = await agent
        .patch(`/api/projects/${projectId}`)
        .send({ name: 'Updated' })
        .expect(200);

      // Verify updated_at changed from the old timestamp
      assert.notEqual(updated.body.updated_at, oldTimestamp);
      assert.ok(new Date(updated.body.updated_at) > new Date(oldTimestamp));
    });

    it('created_at does not change on PATCH', async () => {
      const original = await agent.get(`/api/projects/${defaultProjectId}`);
      const originalCreatedAt = original.body.created_at;

      const updated = await agent
        .patch(`/api/projects/${defaultProjectId}`)
        .send({ name: 'Updated' })
        .expect(200);

      assert.equal(updated.body.created_at, originalCreatedAt);
    });
  });
});

/**
 * Per-key ownership tests.
 *
 * Verifies the security model: agent keys can only see / mutate projects they
 * own. Cross-tenant access returns 404 so existence is not leaked.
 */
describe('Projects API - Per-key ownership', () => {
  const express = require('express');
  const projectsRouter = require('../src/routes/projects');
  const cardsRouter = require('../src/routes/cards');
  const keysRouter = require('../src/routes/keys');
  const { hashKey, rateLimitStore } = require('../src/routes/keys');

  /**
   * Build an Express app with the same auth middleware shape as src/index.js,
   * so the real route modules exercise their canAccessProject() checks.
   */
  function createOwnershipApp() {
    const app = express();
    app.use(express.json());

    function authenticate(req) {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) return false;
      const token = auth.slice(7);
      if (!token) return false;
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

    // Key bootstrap (unauthenticated)
    app.use('/api/keys', keysRouter);

    // Everything else requires auth (agent keys exist in DB -> isAuthConfigured() is true)
    app.use('/api/projects', requireAuth, projectsRouter);
    app.use('/api/projects/:projectId/cards', requireAuth, cardsRouter);

    return app;
  }

  let app;
  let keyA, keyAId, projectA;
  let keyB, keyBId, projectB;

  beforeEach(async () => {
    resetDb();
    db.exec('DELETE FROM api_keys');
    rateLimitStore.clear();
    app = createOwnershipApp();

    // Bootstrap two agent keys; each gets its own private project.
    const resA = await request(app).post('/api/keys').send({ name: 'Alice' }).expect(201);
    keyA = resA.body.key;
    keyAId = resA.body.id;
    projectA = resA.body.project_id;

    const resB = await request(app).post('/api/keys').send({ name: 'Bob' }).expect(201);
    keyB = resB.body.key;
    keyBId = resB.body.id;
    projectB = resB.body.project_id;
  });

  describe('GET /api/projects (scoped listing)', () => {
    it('agent key A sees only A\'s projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${keyA}`)
        .expect(200);

      // Default project is admin-owned (owner_key_id NULL) so A should NOT see it.
      const ids = res.body.map(p => p.id);
      assert.ok(ids.includes(projectA), 'A should see A\'s project');
      assert.ok(!ids.includes(projectB), 'A should not see B\'s project');
    });

    it('agent key B sees only B\'s projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${keyB}`)
        .expect(200);

      const ids = res.body.map(p => p.id);
      assert.ok(ids.includes(projectB));
      assert.ok(!ids.includes(projectA));
    });

    it('agent keys do not see admin-owned (legacy) projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${keyA}`)
        .expect(200);

      // The Default project from resetDb has owner_key_id = NULL
      const ids = res.body.map(p => p.id);
      const defaultId = db.prepare("SELECT id FROM projects WHERE name = 'Default'").get().id;
      assert.ok(!ids.includes(defaultId), 'A should not see admin-owned Default project');
    });
  });

  describe('GET /api/projects/:id (cross-tenant 404)', () => {
    it('returns 404 when A tries to fetch B\'s project', async () => {
      await request(app)
        .get(`/api/projects/${projectB}`)
        .set('Authorization', `Bearer ${keyA}`)
        .expect(404);
    });

    it('returns 404 for admin-owned project when agent tries to fetch it', async () => {
      const defaultId = db.prepare("SELECT id FROM projects WHERE name = 'Default'").get().id;
      await request(app)
        .get(`/api/projects/${defaultId}`)
        .set('Authorization', `Bearer ${keyA}`)
        .expect(404);
    });

    it('returns 200 when agent fetches its own project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectA}`)
        .set('Authorization', `Bearer ${keyA}`)
        .expect(200);
      assert.equal(res.body.id, projectA);
    });
  });

  describe('PATCH /api/projects/:id (cross-tenant 404)', () => {
    it('cannot patch another key\'s project', async () => {
      await request(app)
        .patch(`/api/projects/${projectB}`)
        .set('Authorization', `Bearer ${keyA}`)
        .send({ name: 'Hijacked' })
        .expect(404);

      // Verify B's project was NOT modified
      const row = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectB);
      assert.notEqual(row.name, 'Hijacked');
    });

    it('can patch own project', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectA}`)
        .set('Authorization', `Bearer ${keyA}`)
        .send({ name: 'Renamed By Owner' })
        .expect(200);
      assert.equal(res.body.name, 'Renamed By Owner');
    });
  });

  describe('DELETE /api/projects/:id (cross-tenant 404)', () => {
    it('cannot delete another key\'s project', async () => {
      await request(app)
        .delete(`/api/projects/${projectB}`)
        .set('Authorization', `Bearer ${keyA}`)
        .expect(404);

      // Verify B's project still exists
      const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectB);
      assert.ok(row, 'B\'s project should still exist');
    });
  });

  describe('POST /api/projects (ownership stamping)', () => {
    it('new project is stamped with creator\'s key id', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${keyA}`)
        .send({ name: 'Another A Project' })
        .expect(201);

      const row = db.prepare('SELECT owner_key_id FROM projects WHERE id = ?').get(res.body.id);
      assert.equal(row.owner_key_id, keyAId, 'New project should be owned by the creating key');
    });

    it('other keys cannot see the newly created project', async () => {
      const createRes = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${keyA}`)
        .send({ name: 'Private To A' })
        .expect(201);

      await request(app)
        .get(`/api/projects/${createRes.body.id}`)
        .set('Authorization', `Bearer ${keyB}`)
        .expect(404);
    });
  });

  describe('Unauthenticated access', () => {
    it('GET /api/projects returns 401 without auth', async () => {
      await request(app)
        .get('/api/projects')
        .expect(401);
    });

    it('GET /api/projects/:id returns 401 without auth', async () => {
      await request(app)
        .get(`/api/projects/${projectA}`)
        .expect(401);
    });
  });
});
