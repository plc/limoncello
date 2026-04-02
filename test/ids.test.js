/**
 * Test suite for ID generation (src/lib/ids.js)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { cardId, projectId } = require('../src/lib/ids');

describe('ID generation', () => {
  describe('cardId()', () => {
    it('returns string starting with "crd_"', () => {
      const id = cardId();
      assert.ok(id.startsWith('crd_'), `Expected ID to start with 'crd_', got: ${id}`);
    });

    it('returns string of correct length (16 chars: 4 prefix + 12 id)', () => {
      const id = cardId();
      assert.strictEqual(id.length, 16, `Expected length 16, got ${id.length} for ID: ${id}`);
    });

    it('only uses alphanumeric characters after prefix', () => {
      const id = cardId();
      const idPart = id.slice(4); // Remove 'crd_' prefix
      const alphanumericPattern = /^[0-9A-Za-z]+$/;
      assert.ok(
        alphanumericPattern.test(idPart),
        `Expected alphanumeric ID, got: ${idPart}`
      );
    });

    it('generates unique IDs on multiple calls', () => {
      const ids = new Set();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        ids.add(cardId());
      }

      assert.strictEqual(
        ids.size,
        iterations,
        `Expected ${iterations} unique IDs, got ${ids.size}`
      );
    });
  });

  describe('projectId()', () => {
    it('returns string starting with "prj_"', () => {
      const id = projectId();
      assert.ok(id.startsWith('prj_'), `Expected ID to start with 'prj_', got: ${id}`);
    });

    it('returns string of correct length (16 chars: 4 prefix + 12 id)', () => {
      const id = projectId();
      assert.strictEqual(id.length, 16, `Expected length 16, got ${id.length} for ID: ${id}`);
    });

    it('only uses alphanumeric characters after prefix', () => {
      const id = projectId();
      const idPart = id.slice(4); // Remove 'prj_' prefix
      const alphanumericPattern = /^[0-9A-Za-z]+$/;
      assert.ok(
        alphanumericPattern.test(idPart),
        `Expected alphanumeric ID, got: ${idPart}`
      );
    });

    it('generates unique IDs on multiple calls', () => {
      const ids = new Set();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        ids.add(projectId());
      }

      assert.strictEqual(
        ids.size,
        iterations,
        `Expected ${iterations} unique IDs, got ${ids.size}`
      );
    });
  });

  describe('cardId() vs projectId()', () => {
    it('use different prefixes and produce distinct IDs', () => {
      const cid = cardId();
      const pid = projectId();

      assert.notEqual(cid, pid, 'cardId and projectId should never produce the same value');
      assert.notEqual(cid.slice(4), pid.slice(4), 'Even the ID parts should differ');
    });
  });
});
