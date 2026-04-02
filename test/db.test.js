/**
 * Test suite for database schema and initialization (src/db.js)
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetDb } = require('./helpers');

describe('Database schema', () => {
  beforeEach(() => {
    resetDb();
  });

  describe('Schema initialization', () => {
    it('creates projects table', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='projects'
      `).all();

      assert.strictEqual(tables.length, 1, 'projects table should exist');
      assert.strictEqual(tables[0].name, 'projects');
    });

    it('creates cards table', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='cards'
      `).all();

      assert.strictEqual(tables.length, 1, 'cards table should exist');
      assert.strictEqual(tables[0].name, 'cards');
    });
  });

  describe('Cards table schema', () => {
    it('has all expected columns', () => {
      const columns = db.prepare("PRAGMA table_info(cards)").all();
      const columnNames = columns.map(col => col.name);

      const expectedColumns = [
        'id',
        'project_id',
        'title',
        'description',
        'status',
        'substatus',
        'position',
        'created_at',
        'updated_at'
      ];

      for (const expected of expectedColumns) {
        assert.ok(
          columnNames.includes(expected),
          `cards table should have column: ${expected}`
        );
      }

      assert.strictEqual(
        columnNames.length,
        expectedColumns.length,
        `Expected ${expectedColumns.length} columns, got ${columnNames.length}: ${columnNames.join(', ')}`
      );
    });

    it('has correct column types and constraints', () => {
      const columns = db.prepare("PRAGMA table_info(cards)").all();
      const columnMap = Object.fromEntries(columns.map(col => [col.name, col]));

      // id: TEXT PRIMARY KEY
      assert.strictEqual(columnMap.id.type, 'TEXT');
      assert.strictEqual(columnMap.id.pk, 1, 'id should be primary key');

      // project_id: TEXT NOT NULL
      assert.strictEqual(columnMap.project_id.type, 'TEXT');
      assert.strictEqual(columnMap.project_id.notnull, 1, 'project_id should be NOT NULL');

      // title: TEXT NOT NULL
      assert.strictEqual(columnMap.title.type, 'TEXT');
      assert.strictEqual(columnMap.title.notnull, 1, 'title should be NOT NULL');

      // description: TEXT with default
      assert.strictEqual(columnMap.description.type, 'TEXT');

      // status: TEXT NOT NULL with default
      assert.strictEqual(columnMap.status.type, 'TEXT');
      assert.strictEqual(columnMap.status.notnull, 1, 'status should be NOT NULL');

      // substatus: TEXT nullable
      assert.strictEqual(columnMap.substatus.type, 'TEXT');
      assert.strictEqual(columnMap.substatus.notnull, 0, 'substatus should be nullable');

      // position: INTEGER NOT NULL
      assert.strictEqual(columnMap.position.type, 'INTEGER');
      assert.strictEqual(columnMap.position.notnull, 1, 'position should be NOT NULL');

      // created_at: TEXT NOT NULL
      assert.strictEqual(columnMap.created_at.type, 'TEXT');
      assert.strictEqual(columnMap.created_at.notnull, 1, 'created_at should be NOT NULL');

      // updated_at: TEXT NOT NULL
      assert.strictEqual(columnMap.updated_at.type, 'TEXT');
      assert.strictEqual(columnMap.updated_at.notnull, 1, 'updated_at should be NOT NULL');
    });
  });

  describe('Projects table schema', () => {
    it('has all expected columns', () => {
      const columns = db.prepare("PRAGMA table_info(projects)").all();
      const columnNames = columns.map(col => col.name);

      const expectedColumns = ['id', 'name', 'columns', 'created_at', 'updated_at'];

      for (const expected of expectedColumns) {
        assert.ok(
          columnNames.includes(expected),
          `projects table should have column: ${expected}`
        );
      }

      assert.strictEqual(
        columnNames.length,
        expectedColumns.length,
        `Expected ${expectedColumns.length} columns, got ${columnNames.length}`
      );
    });

    it('has correct column types and constraints', () => {
      const columns = db.prepare("PRAGMA table_info(projects)").all();
      const columnMap = Object.fromEntries(columns.map(col => [col.name, col]));

      // id: TEXT PRIMARY KEY
      assert.strictEqual(columnMap.id.type, 'TEXT');
      assert.strictEqual(columnMap.id.pk, 1, 'id should be primary key');

      // name: TEXT NOT NULL
      assert.strictEqual(columnMap.name.type, 'TEXT');
      assert.strictEqual(columnMap.name.notnull, 1, 'name should be NOT NULL');

      // columns: TEXT NOT NULL
      assert.strictEqual(columnMap.columns.type, 'TEXT');
      assert.strictEqual(columnMap.columns.notnull, 1, 'columns should be NOT NULL');

      // created_at: TEXT NOT NULL
      assert.strictEqual(columnMap.created_at.type, 'TEXT');
      assert.strictEqual(columnMap.created_at.notnull, 1, 'created_at should be NOT NULL');

      // updated_at: TEXT NOT NULL
      assert.strictEqual(columnMap.updated_at.type, 'TEXT');
      assert.strictEqual(columnMap.updated_at.notnull, 1, 'updated_at should be NOT NULL');
    });
  });

  describe('Default project', () => {
    it('is created on fresh init', () => {
      const projects = db.prepare('SELECT * FROM projects').all();
      assert.ok(projects.length >= 1, 'At least one project should exist after init');

      const defaultProject = projects[0];
      assert.strictEqual(defaultProject.name, 'Default', 'First project should be named "Default"');
    });

    it('has expected default columns', () => {
      const project = db.prepare('SELECT columns FROM projects ORDER BY created_at LIMIT 1').get();
      assert.ok(project, 'Default project should exist');

      const columns = JSON.parse(project.columns);
      assert.ok(Array.isArray(columns), 'columns should be a JSON array');

      const columnKeys = columns.map(col => col.key);
      const expectedKeys = ['backlog', 'todo', 'in_progress', 'blocked', 'done'];

      assert.deepStrictEqual(
        columnKeys,
        expectedKeys,
        `Expected column keys: ${expectedKeys.join(', ')}, got: ${columnKeys.join(', ')}`
      );
    });

    it('has blocked column with sub-statuses', () => {
      const project = db.prepare('SELECT columns FROM projects ORDER BY created_at LIMIT 1').get();
      const columns = JSON.parse(project.columns);

      const blockedColumn = columns.find(col => col.key === 'blocked');
      assert.ok(blockedColumn, 'Should have a "blocked" column');
      assert.ok(
        Array.isArray(blockedColumn.substatuses),
        'blocked column should have substatuses array'
      );

      const substatusKeys = blockedColumn.substatuses.map(s => s.key);
      assert.ok(
        substatusKeys.includes('human_review'),
        'blocked should have human_review substatus'
      );
      assert.ok(
        substatusKeys.includes('agent_review'),
        'blocked should have agent_review substatus'
      );
    });
  });

  describe('Foreign key constraints', () => {
    it('rejects card insert with non-existent project_id', () => {
      const { cardId } = require('../src/lib/ids');

      assert.throws(
        () => {
          db.prepare(`
            INSERT INTO cards (id, project_id, title, status, position)
            VALUES (?, ?, ?, ?, ?)
          `).run(cardId(), 'prj_nonexistent', 'Test card', 'backlog', 0);
        },
        (err) => {
          return err.message.includes('FOREIGN KEY constraint failed');
        },
        'Should throw foreign key constraint error'
      );
    });

    it('allows card insert with valid project_id', () => {
      const { cardId } = require('../src/lib/ids');
      const defaultProject = db.prepare('SELECT id FROM projects LIMIT 1').get();

      assert.doesNotThrow(() => {
        db.prepare(`
          INSERT INTO cards (id, project_id, title, status, position)
          VALUES (?, ?, ?, ?, ?)
        `).run(cardId(), defaultProject.id, 'Valid card', 'backlog', 0);
      });

      const cards = db.prepare('SELECT * FROM cards').all();
      assert.strictEqual(cards.length, 1, 'Card should be inserted successfully');
      assert.strictEqual(cards[0].title, 'Valid card');
    });
  });

  describe('Indexes', () => {
    it('has idx_cards_project_status index', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_cards_project_status'
      `).all();

      assert.strictEqual(
        indexes.length,
        1,
        'idx_cards_project_status index should exist'
      );
    });

    it('idx_cards_project_status covers correct columns', () => {
      const indexInfo = db.prepare("PRAGMA index_info(idx_cards_project_status)").all();
      const columnNames = indexInfo.map(col => col.name);

      assert.ok(
        columnNames.includes('project_id'),
        'Index should include project_id'
      );
      assert.ok(
        columnNames.includes('status'),
        'Index should include status'
      );
      assert.ok(
        columnNames.includes('position'),
        'Index should include position'
      );
    });
  });

  describe('Database configuration', () => {
    it('has WAL mode enabled (or memory mode for :memory: databases)', () => {
      const result = db.pragma('journal_mode');
      const mode = result[0].journal_mode.toLowerCase();

      // In-memory databases use 'memory' mode, file-based use 'wal'
      assert.ok(
        mode === 'wal' || mode === 'memory',
        `Journal mode should be 'wal' or 'memory', got: ${mode}`
      );
    });

    it('has foreign keys enabled', () => {
      const result = db.pragma('foreign_keys');
      assert.strictEqual(
        result[0].foreign_keys,
        1,
        'Foreign keys should be enabled'
      );
    });
  });
});
