/**
 * Cards API Tests
 *
 * Tests for /api/projects/:projectId/cards and /api/cards (backward compat).
 * Uses Node's built-in test runner with supertest for HTTP testing.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp, resetDb, getDefaultProject, db } = require('./helpers');

describe('Cards API', () => {
  let app;
  let projectId;

  beforeEach(() => {
    app = createApp();
    projectId = resetDb();
  });

  describe('GET /api/projects/:projectId/cards', () => {
    it('returns empty array initially', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards`)
        .expect(200);

      assert.deepEqual(res.body, []);
    });

    it('returns cards after creation', async () => {
      // Create two cards
      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'First card' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Second card', status: 'todo' })
        .expect(201);

      const res = await request(app)
        .get(`/api/projects/${projectId}/cards`)
        .expect(200);

      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].title, 'First card');
      assert.equal(res.body[1].title, 'Second card');
    });

    it('filters by status query param', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Backlog card', status: 'backlog' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Todo card', status: 'todo' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Another todo', status: 'todo' })
        .expect(201);

      const res = await request(app)
        .get(`/api/projects/${projectId}/cards?status=todo`)
        .expect(200);

      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].title, 'Todo card');
      assert.equal(res.body[1].title, 'Another todo');
    });

    it('rejects invalid status', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards?status=invalid_status`)
        .expect(400);

      assert.match(res.body.error, /Invalid status/);
    });

    it('orders by column order then position', async () => {
      // Create cards in different columns
      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Done card', status: 'done' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Backlog card', status: 'backlog' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Todo card', status: 'todo' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Another backlog', status: 'backlog' })
        .expect(201);

      const res = await request(app)
        .get(`/api/projects/${projectId}/cards`)
        .expect(200);

      // Expected order based on default columns: backlog, todo, in_progress, blocked, done
      assert.equal(res.body[0].title, 'Backlog card');
      assert.equal(res.body[0].status, 'backlog');
      assert.equal(res.body[0].position, 0);

      assert.equal(res.body[1].title, 'Another backlog');
      assert.equal(res.body[1].status, 'backlog');
      assert.equal(res.body[1].position, 1);

      assert.equal(res.body[2].title, 'Todo card');
      assert.equal(res.body[2].status, 'todo');

      assert.equal(res.body[3].title, 'Done card');
      assert.equal(res.body[3].status, 'done');
    });
  });

  describe('GET /api/cards (backward compat)', () => {
    it('works the same as project-scoped endpoint for default project', async () => {
      // Create cards via default project endpoint
      await request(app)
        .post('/api/cards')
        .send({ title: 'Card 1' })
        .expect(201);

      await request(app)
        .post('/api/cards')
        .send({ title: 'Card 2', status: 'todo' })
        .expect(201);

      // List via compat endpoint
      const res1 = await request(app)
        .get('/api/cards')
        .expect(200);

      // List via project-scoped endpoint
      const res2 = await request(app)
        .get(`/api/projects/${projectId}/cards`)
        .expect(200);

      assert.deepEqual(res1.body, res2.body);
      assert.equal(res1.body.length, 2);
    });

    it('filters by status via compat endpoint', async () => {
      await request(app)
        .post('/api/cards')
        .send({ title: 'Backlog card', status: 'backlog' })
        .expect(201);

      await request(app)
        .post('/api/cards')
        .send({ title: 'Todo card', status: 'todo' })
        .expect(201);

      const res = await request(app)
        .get('/api/cards?status=todo')
        .expect(200);

      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Todo card');
    });
  });

  describe('POST /api/projects/:projectId/cards', () => {
    it('creates card with just title (defaults: backlog status, position 0)', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Test card' })
        .expect(201);

      assert.equal(res.body.title, 'Test card');
      assert.equal(res.body.status, 'backlog');
      assert.equal(res.body.position, 0);
      assert.equal(res.body.description, '');
      assert.equal(res.body.substatus, null);
      assert.equal(res.body.project_id, projectId);
      assert.match(res.body.id, /^crd_/);
    });

    it('creates card with title and description', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({
          title: 'Card with description',
          description: 'This is a detailed description'
        })
        .expect(201);

      assert.equal(res.body.title, 'Card with description');
      assert.equal(res.body.description, 'This is a detailed description');
    });

    it('creates card with specific status', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Todo card', status: 'todo' })
        .expect(201);

      assert.equal(res.body.title, 'Todo card');
      assert.equal(res.body.status, 'todo');
      assert.equal(res.body.position, 0);
    });

    it('creates card with substatus', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({
          title: 'Blocked card',
          status: 'blocked',
          substatus: 'human_review'
        })
        .expect(201);

      assert.equal(res.body.title, 'Blocked card');
      assert.equal(res.body.status, 'blocked');
      assert.equal(res.body.substatus, 'human_review');
    });

    it('rejects empty title', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: '   ' })
        .expect(400);

      assert.match(res.body.error, /Title is required/);
    });

    it('rejects missing title', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ description: 'No title provided' })
        .expect(400);

      assert.match(res.body.error, /Title is required/);
    });

    it('rejects invalid status', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Test', status: 'invalid_status' })
        .expect(400);

      assert.match(res.body.error, /Invalid status/);
    });

    it('rejects invalid substatus for the given status', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({
          title: 'Test',
          status: 'blocked',
          substatus: 'invalid_substatus'
        })
        .expect(400);

      assert.match(res.body.error, /Invalid substatus "invalid_substatus" for status "blocked"/);
    });

    it('rejects substatus on status that has no substatuses', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({
          title: 'Test',
          status: 'todo',
          substatus: 'some_substatus'
        })
        .expect(400);

      assert.match(res.body.error, /Invalid substatus "some_substatus" for status "todo"/);
    });

    it('returns 201 with created card', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'New card' })
        .expect(201);

      assert.ok(res.body.id);
      assert.ok(res.body.created_at);
      assert.ok(res.body.updated_at);
    });

    it('card has crd_ prefixed ID', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Test' })
        .expect(201);

      assert.match(res.body.id, /^crd_/);
    });

    it('auto-increments position within same status', async () => {
      const res1 = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'First todo', status: 'todo' })
        .expect(201);

      const res2 = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Second todo', status: 'todo' })
        .expect(201);

      const res3 = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Third todo', status: 'todo' })
        .expect(201);

      assert.equal(res1.body.position, 0);
      assert.equal(res2.body.position, 1);
      assert.equal(res3.body.position, 2);
    });

    it('returns 404 for non-existent project', async () => {
      const res = await request(app)
        .post('/api/projects/prj_nonexistent/cards')
        .send({ title: 'Test' })
        .expect(404);

      assert.match(res.body.error, /Project not found/);
    });
  });

  describe('GET /api/projects/:projectId/cards/:id', () => {
    it('returns card by ID', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Test card', description: 'Test description' })
        .expect(201);

      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/${created.body.id}`)
        .expect(200);

      assert.equal(res.body.id, created.body.id);
      assert.equal(res.body.title, 'Test card');
      assert.equal(res.body.description, 'Test description');
    });

    it('returns 404 for non-existent card', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/crd_nonexistent`)
        .expect(404);

      assert.match(res.body.error, /Card not found/);
    });

    it('returns 404 for card in different project', async () => {
      // Create another project
      const project2Res = await request(app)
        .post('/api/projects')
        .send({ name: 'Project 2' })
        .expect(201);

      const project2Id = project2Res.body.id;

      // Create card in project 2
      const cardRes = await request(app)
        .post(`/api/projects/${project2Id}/cards`)
        .send({ title: 'Card in project 2' })
        .expect(201);

      // Try to get it via project 1
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/${cardRes.body.id}`)
        .expect(404);

      assert.match(res.body.error, /Card not found/);
    });
  });

  describe('PATCH /api/projects/:projectId/cards/:id', () => {
    let cardId;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Original title', description: 'Original description', status: 'backlog' });
      cardId = res.body.id;
    });

    it('updates title', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ title: 'Updated title' })
        .expect(200);

      assert.equal(res.body.title, 'Updated title');
      assert.equal(res.body.description, 'Original description');
    });

    it('updates description', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ description: 'Updated description' })
        .expect(200);

      assert.equal(res.body.title, 'Original title');
      assert.equal(res.body.description, 'Updated description');
    });

    it('updates status (moves card to new column)', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ status: 'todo' })
        .expect(200);

      assert.equal(res.body.status, 'todo');
    });

    it('position auto-assigned when status changes', async () => {
      // Create another card in todo
      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Existing todo', status: 'todo' })
        .expect(201);

      // Move our card to todo
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ status: 'todo' })
        .expect(200);

      // Should be positioned after the existing todo card
      assert.equal(res.body.status, 'todo');
      assert.equal(res.body.position, 1);
    });

    it('substatus auto-clears when status changes', async () => {
      // Create a blocked card with substatus
      const blockedRes = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({
          title: 'Blocked card',
          status: 'blocked',
          substatus: 'human_review'
        })
        .expect(201);

      // Move to different status without specifying substatus
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${blockedRes.body.id}`)
        .send({ status: 'todo' })
        .expect(200);

      assert.equal(res.body.status, 'todo');
      assert.equal(res.body.substatus, null);
    });

    it('can set substatus explicitly when changing status', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ status: 'blocked', substatus: 'agent_review' })
        .expect(200);

      assert.equal(res.body.status, 'blocked');
      assert.equal(res.body.substatus, 'agent_review');
    });

    it('can update substatus without changing status', async () => {
      // Create a blocked card with substatus
      const blockedRes = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({
          title: 'Blocked card',
          status: 'blocked',
          substatus: 'human_review'
        })
        .expect(201);

      // Update substatus only
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${blockedRes.body.id}`)
        .send({ substatus: 'agent_review' })
        .expect(200);

      assert.equal(res.body.status, 'blocked');
      assert.equal(res.body.substatus, 'agent_review');
    });

    it('can clear substatus by setting to null', async () => {
      // Create a blocked card with substatus
      const blockedRes = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({
          title: 'Blocked card',
          status: 'blocked',
          substatus: 'human_review'
        })
        .expect(201);

      // Clear substatus
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${blockedRes.body.id}`)
        .send({ substatus: null })
        .expect(200);

      assert.equal(res.body.status, 'blocked');
      assert.equal(res.body.substatus, null);
    });

    it('rejects invalid status', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ status: 'invalid_status' })
        .expect(400);

      assert.match(res.body.error, /Invalid status/);
    });

    it('rejects invalid substatus', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ status: 'blocked', substatus: 'invalid_substatus' })
        .expect(400);

      assert.match(res.body.error, /Invalid substatus/);
    });

    it('rejects empty title', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ title: '   ' })
        .expect(400);

      assert.match(res.body.error, /Title must be a non-empty string/);
    });

    it('returns 404 for non-existent card', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/crd_nonexistent`)
        .send({ title: 'Updated' })
        .expect(404);

      assert.match(res.body.error, /Card not found/);
    });

    it('rejects no valid fields', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({})
        .expect(400);

      assert.match(res.body.error, /No valid fields to update/);
    });

    it('can update position explicitly', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ position: 5 })
        .expect(200);

      assert.equal(res.body.position, 5);
    });

    it('trims whitespace from title', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ title: '  Trimmed title  ' })
        .expect(200);

      assert.equal(res.body.title, 'Trimmed title');
    });
  });

  describe('DELETE /api/projects/:projectId/cards/:id', () => {
    let cardId;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card to delete' });
      cardId = res.body.id;
    });

    it('deletes card', async () => {
      await request(app)
        .delete(`/api/projects/${projectId}/cards/${cardId}`)
        .expect(204);

      // Verify it's gone
      await request(app)
        .get(`/api/projects/${projectId}/cards/${cardId}`)
        .expect(404);
    });

    it('returns 204', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}/cards/${cardId}`)
        .expect(204);

      assert.equal(res.text, '');
    });

    it('returns 404 for non-existent card', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}/cards/crd_nonexistent`)
        .expect(404);

      assert.match(res.body.error, /Card not found/);
    });

    it('card no longer in list after delete', async () => {
      await request(app)
        .delete(`/api/projects/${projectId}/cards/${cardId}`)
        .expect(204);

      const res = await request(app)
        .get(`/api/projects/${projectId}/cards`)
        .expect(200);

      assert.equal(res.body.length, 0);
    });

    it('only deletes from specified project', async () => {
      // Create another project with a card
      const project2Res = await request(app)
        .post('/api/projects')
        .send({ name: 'Project 2' })
        .expect(201);

      const project2Id = project2Res.body.id;

      const card2Res = await request(app)
        .post(`/api/projects/${project2Id}/cards`)
        .send({ title: 'Card in project 2' })
        .expect(201);

      // Try to delete project 2's card via project 1
      await request(app)
        .delete(`/api/projects/${projectId}/cards/${card2Res.body.id}`)
        .expect(404);

      // Verify card still exists in project 2
      await request(app)
        .get(`/api/projects/${project2Id}/cards/${card2Res.body.id}`)
        .expect(200);
    });
  });

  describe('PATCH /api/projects/:projectId/cards/reorder', () => {
    let card1, card2, card3;

    beforeEach(async () => {
      const res1 = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card 1', status: 'todo' });
      card1 = res1.body;

      const res2 = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card 2', status: 'todo' });
      card2 = res2.body;

      const res3 = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card 3', status: 'todo' });
      card3 = res3.body;
    });

    it('reorders cards within a column', async () => {
      // Reverse the order
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/reorder`)
        .send({
          cards: [
            { id: card3.id, position: 0 },
            { id: card2.id, position: 1 },
            { id: card1.id, position: 2 }
          ]
        })
        .expect(200);

      assert.equal(res.body.updated, 3);

      // Verify new order
      const listRes = await request(app)
        .get(`/api/projects/${projectId}/cards?status=todo`)
        .expect(200);

      assert.equal(listRes.body[0].id, card3.id);
      assert.equal(listRes.body[0].position, 0);
      assert.equal(listRes.body[1].id, card2.id);
      assert.equal(listRes.body[1].position, 1);
      assert.equal(listRes.body[2].id, card1.id);
      assert.equal(listRes.body[2].position, 2);
    });

    it('returns updated count', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/reorder`)
        .send({
          cards: [
            { id: card1.id, position: 5 },
            { id: card2.id, position: 10 }
          ]
        })
        .expect(200);

      assert.equal(res.body.updated, 2);
    });

    it('rejects non-array body', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/reorder`)
        .send({ cards: 'not an array' })
        .expect(400);

      assert.match(res.body.error, /must contain a "cards" array/);
    });

    it('rejects missing id', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/reorder`)
        .send({
          cards: [
            { position: 0 }
          ]
        })
        .expect(400);

      assert.match(res.body.error, /must have id and position/);
    });

    it('rejects missing position', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/reorder`)
        .send({
          cards: [
            { id: card1.id }
          ]
        })
        .expect(400);

      assert.match(res.body.error, /must have id and position/);
    });

    it('handles empty array gracefully', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/reorder`)
        .send({ cards: [] })
        .expect(200);

      assert.equal(res.body.updated, 0);
    });

    it('only reorders cards in specified project', async () => {
      // Create another project with a card
      const project2Res = await request(app)
        .post('/api/projects')
        .send({ name: 'Project 2' })
        .expect(201);

      const project2Id = project2Res.body.id;

      const card2Res = await request(app)
        .post(`/api/projects/${project2Id}/cards`)
        .send({ title: 'Card in project 2' })
        .expect(201);

      // Try to reorder project 2's card via project 1
      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/reorder`)
        .send({
          cards: [
            { id: card2Res.body.id, position: 99 }
          ]
        })
        .expect(200);

      // Verify the card in project 2 wasn't affected
      const verifyRes = await request(app)
        .get(`/api/projects/${project2Id}/cards/${card2Res.body.id}`)
        .expect(200);

      assert.equal(verifyRes.body.position, 0); // Original position
    });
  });

  describe('GET /api/projects/:projectId/cards/changes', () => {
    it('returns cards changed since timestamp', async () => {
      // Use a timestamp 2 seconds in the past to avoid SQLite second-precision issues
      const startTime = new Date(Date.now() - 2000).toISOString();

      // Create a card
      const res1 = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'New card' })
        .expect(201);

      // Get changes
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/changes?since=${startTime}`)
        .expect(200);

      assert.equal(res.body.cards.length, 1);
      assert.equal(res.body.cards[0].id, res1.body.id);
      assert.ok(res.body.server_time);
    });

    it('returns empty array when no changes', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/changes?since=${new Date().toISOString()}`)
        .expect(200);

      assert.deepEqual(res.body.cards, []);
      assert.ok(res.body.server_time);
    });

    it('requires since parameter', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/changes`)
        .expect(400);

      assert.match(res.body.error, /since.*required/i);
    });

    it('rejects invalid timestamp', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/changes?since=invalid-timestamp`)
        .expect(400);

      assert.match(res.body.error, /Invalid ISO 8601/);
    });

    it('returns server_time in response', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/changes?since=${new Date().toISOString()}`)
        .expect(200);

      assert.ok(res.body.server_time);
      const serverTime = new Date(res.body.server_time);
      assert.ok(!isNaN(serverTime.getTime()));
    });

    it('includes updated cards', async () => {
      // Use a timestamp 2 seconds in the past
      const beforeAll = new Date(Date.now() - 2000).toISOString();

      // Create a card
      const cardRes = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Original' })
        .expect(201);

      // Update the card
      await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardRes.body.id}`)
        .send({ title: 'Updated' })
        .expect(200);

      // Get changes since before everything
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/changes?since=${beforeAll}`)
        .expect(200);

      assert.equal(res.body.cards.length, 1);
      assert.equal(res.body.cards[0].title, 'Updated');
    });

    it('does not include cards from other projects', async () => {
      // Create another project
      const project2Res = await request(app)
        .post('/api/projects')
        .send({ name: 'Project 2' })
        .expect(201);

      const project2Id = project2Res.body.id;

      const startTime = new Date(Date.now() - 2000).toISOString();

      // Create cards in both projects
      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card in project 1' })
        .expect(201);

      await request(app)
        .post(`/api/projects/${project2Id}/cards`)
        .send({ title: 'Card in project 2' })
        .expect(201);

      // Get changes for project 1
      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/changes?since=${startTime}`)
        .expect(200);

      assert.equal(res.body.cards.length, 1);
      assert.equal(res.body.cards[0].title, 'Card in project 1');
    });
  });

  describe('backward compatibility endpoint tests', () => {
    it('POST /api/cards creates in default project', async () => {
      const res = await request(app)
        .post('/api/cards')
        .send({ title: 'Compat card' })
        .expect(201);

      assert.equal(res.body.title, 'Compat card');
      assert.equal(res.body.project_id, projectId);
    });

    it('GET /api/cards/:id retrieves from default project', async () => {
      const created = await request(app)
        .post('/api/cards')
        .send({ title: 'Test' })
        .expect(201);

      const res = await request(app)
        .get(`/api/cards/${created.body.id}`)
        .expect(200);

      assert.equal(res.body.id, created.body.id);
    });

    it('PATCH /api/cards/:id updates in default project', async () => {
      const created = await request(app)
        .post('/api/cards')
        .send({ title: 'Original' })
        .expect(201);

      const res = await request(app)
        .patch(`/api/cards/${created.body.id}`)
        .send({ title: 'Updated' })
        .expect(200);

      assert.equal(res.body.title, 'Updated');
    });

    it('DELETE /api/cards/:id deletes from default project', async () => {
      const created = await request(app)
        .post('/api/cards')
        .send({ title: 'To delete' })
        .expect(201);

      await request(app)
        .delete(`/api/cards/${created.body.id}`)
        .expect(204);

      await request(app)
        .get(`/api/cards/${created.body.id}`)
        .expect(404);
    });

    it('GET /api/cards/changes works via compat endpoint', async () => {
      const startTime = new Date(Date.now() - 2000).toISOString();

      await request(app)
        .post('/api/cards')
        .send({ title: 'New' })
        .expect(201);

      const res = await request(app)
        .get(`/api/cards/changes?since=${startTime}`)
        .expect(200);

      assert.equal(res.body.cards.length, 1);
    });

    it('PATCH /api/cards/reorder works via compat endpoint', async () => {
      const res1 = await request(app)
        .post('/api/cards')
        .send({ title: 'Card 1' });
      const res2 = await request(app)
        .post('/api/cards')
        .send({ title: 'Card 2' });

      const res = await request(app)
        .patch('/api/cards/reorder')
        .send({
          cards: [
            { id: res2.body.id, position: 0 },
            { id: res1.body.id, position: 1 }
          ]
        })
        .expect(200);

      assert.equal(res.body.updated, 2);
    });
  });

  describe('Tags', () => {
    it('creates card with tags', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Tagged card', tags: ['bug', 'urgent'] })
        .expect(201);

      assert.deepEqual(res.body.tags, ['bug', 'urgent']);
    });

    it('creates card without tags (defaults to [])', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'No tags card' })
        .expect(201);

      assert.deepEqual(res.body.tags, []);
    });

    it('updates card tags', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card', tags: ['old'] })
        .expect(201);

      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${created.body.id}`)
        .send({ tags: ['new', 'updated'] })
        .expect(200);

      assert.deepEqual(res.body.tags, ['new', 'updated']);
    });

    it('clears tags via empty array', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card', tags: ['bug'] })
        .expect(201);

      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${created.body.id}`)
        .send({ tags: [] })
        .expect(200);

      assert.deepEqual(res.body.tags, []);
    });

    it('rejects non-array tags', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card', tags: 'not-an-array' })
        .expect(400);

      assert.match(res.body.error, /Tags must be an array/);
    });

    it('rejects tags with non-string elements', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card', tags: [123] })
        .expect(400);

      assert.match(res.body.error, /Each tag must be a non-empty string/);
    });

    it('rejects tags with empty strings', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card', tags: ['valid', ''] })
        .expect(400);

      assert.match(res.body.error, /Each tag must be a non-empty string/);
    });

    it('filters cards by tag query param', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Bug card', tags: ['bug', 'v2'] })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Feature card', tags: ['feature', 'v2'] })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'No tags' })
        .expect(201);

      const bugRes = await request(app)
        .get(`/api/projects/${projectId}/cards?tag=bug`)
        .expect(200);

      assert.equal(bugRes.body.length, 1);
      assert.equal(bugRes.body[0].title, 'Bug card');

      const v2Res = await request(app)
        .get(`/api/projects/${projectId}/cards?tag=v2`)
        .expect(200);

      assert.equal(v2Res.body.length, 2);
    });

    it('tags persist through status changes', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Tagged card', status: 'backlog', tags: ['important'] })
        .expect(201);

      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${created.body.id}`)
        .send({ status: 'todo' })
        .expect(200);

      assert.equal(res.body.status, 'todo');
      assert.deepEqual(res.body.tags, ['important']);
    });

    it('tags returned in changes endpoint', async () => {
      const startTime = new Date(Date.now() - 2000).toISOString();

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Tagged card', tags: ['bug'] })
        .expect(201);

      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/changes?since=${startTime}`)
        .expect(200);

      assert.equal(res.body.cards.length, 1);
      assert.deepEqual(res.body.cards[0].tags, ['bug']);
    });

    it('tags returned when getting single card', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Tagged card', tags: ['feature', 'v3'] })
        .expect(201);

      const res = await request(app)
        .get(`/api/projects/${projectId}/cards/${created.body.id}`)
        .expect(200);

      assert.deepEqual(res.body.tags, ['feature', 'v3']);
    });

    it('trims whitespace from tags', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Card', tags: ['  bug  ', ' urgent '] })
        .expect(201);

      assert.deepEqual(res.body.tags, ['bug', 'urgent']);
    });

    it('can filter by tag and status simultaneously', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Bug in backlog', status: 'backlog', tags: ['bug'] })
        .expect(201);

      await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Bug in todo', status: 'todo', tags: ['bug'] })
        .expect(201);

      const res = await request(app)
        .get(`/api/projects/${projectId}/cards?status=todo&tag=bug`)
        .expect(200);

      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].title, 'Bug in todo');
    });
  });

  describe('edge cases', () => {
    it('handles card with very long title', async () => {
      const longTitle = 'x'.repeat(1000);
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: longTitle })
        .expect(201);

      assert.equal(res.body.title, longTitle);
    });

    it('handles card with very long description', async () => {
      const longDescription = 'x'.repeat(10000);
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Test', description: longDescription })
        .expect(201);

      assert.equal(res.body.description, longDescription);
    });

    it('handles multiple updates to same card', async () => {
      const created = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Original' })
        .expect(201);

      const cardId = created.body.id;

      await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ title: 'Update 1' })
        .expect(200);

      await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ title: 'Update 2' })
        .expect(200);

      const res = await request(app)
        .patch(`/api/projects/${projectId}/cards/${cardId}`)
        .send({ title: 'Update 3' })
        .expect(200);

      assert.equal(res.body.title, 'Update 3');
    });

    it('handles special characters in title', async () => {
      const specialTitle = 'Test <script>alert("xss")</script> & "quotes" \'apostrophes\'';
      const res = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: specialTitle })
        .expect(201);

      assert.equal(res.body.title, specialTitle);
    });

    it('validates substatus belongs to correct status after multiple moves', async () => {
      // Create card in blocked with substatus
      const created = await request(app)
        .post(`/api/projects/${projectId}/cards`)
        .send({ title: 'Test', status: 'blocked', substatus: 'human_review' })
        .expect(201);

      // Move to todo (substatus should clear)
      const res1 = await request(app)
        .patch(`/api/projects/${projectId}/cards/${created.body.id}`)
        .send({ status: 'todo' })
        .expect(200);

      assert.equal(res1.body.substatus, null);

      // Try to set invalid substatus for todo
      const res2 = await request(app)
        .patch(`/api/projects/${projectId}/cards/${created.body.id}`)
        .send({ substatus: 'human_review' })
        .expect(400);

      assert.match(res2.body.error, /Invalid substatus/);
    });

    it('handles concurrent card creation with positions', async () => {
      // Create multiple cards in same status rapidly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post(`/api/projects/${projectId}/cards`)
            .send({ title: `Card ${i}`, status: 'todo' })
        );
      }

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(res => {
        assert.equal(res.status, 201);
      });

      // Positions should be unique and sequential
      const positions = results.map(r => r.body.position).sort((a, b) => a - b);
      for (let i = 0; i < 10; i++) {
        assert.equal(positions[i], i);
      }
    });
  });
});
