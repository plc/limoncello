/**
 * Database connection and schema initialization (SQLite)
 *
 * Exports:
 *   db         -- better-sqlite3 instance
 *   initSchema() -- creates tables and indexes (idempotent)
 *
 * Database file: ./data/limoncello.db (created automatically)
 */

const path = require('path');
const Database = require('better-sqlite3');
const { projectId } = require('./lib/ids');

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'limoncello.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const DEFAULT_COLUMNS = JSON.stringify([
  { key: 'backlog', label: 'Backlog', substatuses: [] },
  { key: 'todo', label: 'To Do', substatuses: [] },
  { key: 'in_progress', label: 'In Progress', substatuses: [] },
  { key: 'blocked', label: 'Blocked', substatuses: [
    { key: 'human_review', label: 'Human Review' },
    { key: 'agent_review', label: 'Agent Review' },
  ]},
  { key: 'done', label: 'Done', substatuses: [] },
]);

/**
 * Create all tables and indexes. Safe to call on every startup.
 * Handles migration from v1 (no projects) to v2 (with projects).
 */
function initSchema() {
  // Create api_keys table first: projects.owner_key_id references it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id         TEXT PRIMARY KEY,
      key_hash   TEXT NOT NULL UNIQUE,
      name       TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used  TEXT DEFAULT NULL,
      revoked_at TEXT DEFAULT NULL
    );
  `);

  // Create projects table. owner_key_id scopes a project to the agent key
  // that created it; NULL means admin-owned (visible only to admin key).
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT DEFAULT '',
      columns      TEXT NOT NULL DEFAULT '${DEFAULT_COLUMNS.replace(/'/g, "''")}',
      owner_key_id TEXT DEFAULT NULL REFERENCES api_keys(id),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Check if cards table needs migration (has CHECK constraint / no project_id)
  const tableInfo = db.prepare("PRAGMA table_info(cards)").all();
  const hasProjectId = tableInfo.some(col => col.name === 'project_id');

  if (tableInfo.length > 0 && !hasProjectId) {
    // Migration: existing cards table without project_id
    migrate_v1_to_v2();
  } else if (tableInfo.length === 0) {
    // Fresh install: create cards table with project_id
    db.exec(`
      CREATE TABLE IF NOT EXISTS cards (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title      TEXT NOT NULL,
        description TEXT DEFAULT '',
        status     TEXT NOT NULL DEFAULT 'backlog',
        substatus  TEXT DEFAULT NULL,
        tags       TEXT DEFAULT '[]',
        position   INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_cards_project_status ON cards(project_id, status, position);
    `);

    // Create default project if none exist
    ensureDefaultProject();
  }

  // Migration: Add substatus column if it doesn't exist
  const currentTableInfo = db.prepare("PRAGMA table_info(cards)").all();
  const hasSubstatus = currentTableInfo.some(col => col.name === 'substatus');
  if (!hasSubstatus && currentTableInfo.length > 0) {
    db.exec('ALTER TABLE cards ADD COLUMN substatus TEXT DEFAULT NULL');
    console.log('Added substatus column to cards table');
  }

  // Migration: Add updated_at column if it doesn't exist
  const updatedTableInfo = db.prepare("PRAGMA table_info(cards)").all();
  const hasUpdatedAt = updatedTableInfo.some(col => col.name === 'updated_at');
  if (!hasUpdatedAt && updatedTableInfo.length > 0) {
    db.exec("ALTER TABLE cards ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
    console.log('Added updated_at column to cards table');
  }

  // Migration: Add tags column if it doesn't exist
  const tagsTableInfo = db.prepare("PRAGMA table_info(cards)").all();
  const hasTags = tagsTableInfo.some(col => col.name === 'tags');
  if (!hasTags && tagsTableInfo.length > 0) {
    db.exec("ALTER TABLE cards ADD COLUMN tags TEXT DEFAULT '[]'");
    console.log('Added tags column to cards table');
  }

  // Migration: Add description column to projects table if it doesn't exist
  const projectsTableInfo = db.prepare("PRAGMA table_info(projects)").all();
  const hasDescription = projectsTableInfo.some(col => col.name === 'description');
  if (!hasDescription && projectsTableInfo.length > 0) {
    db.exec("ALTER TABLE projects ADD COLUMN description TEXT DEFAULT ''");
    console.log('Added description column to projects table');
  }

  // Migration: Add owner_key_id to projects table if it doesn't exist.
  // Existing rows default to NULL (admin-owned) -- this is a deliberate
  // security decision: pre-migration projects become invisible to any
  // subsequently bootstrapped agent key. See CHANGELOG.md.
  const projectsInfoForOwner = db.prepare("PRAGMA table_info(projects)").all();
  const hasOwnerKeyId = projectsInfoForOwner.some(col => col.name === 'owner_key_id');
  if (!hasOwnerKeyId && projectsInfoForOwner.length > 0) {
    db.exec("ALTER TABLE projects ADD COLUMN owner_key_id TEXT DEFAULT NULL REFERENCES api_keys(id)");
    console.log('Added owner_key_id column to projects table (existing rows default to admin-owned)');
  }

  // Index for fast ownership filtering
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_key_id)');
}

/**
 * Migrate v1 cards table (no project_id, CHECK constraint) to v2.
 */
function migrate_v1_to_v2() {
  const defaultId = ensureDefaultProject();

  db.exec(`
    -- Rename old table
    ALTER TABLE cards RENAME TO cards_v1;

    -- Create new table without CHECK, with project_id
    CREATE TABLE cards (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title      TEXT NOT NULL,
      description TEXT DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'backlog',
      substatus  TEXT DEFAULT NULL,
      tags       TEXT DEFAULT '[]',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Copy data, assigning all to default project
    INSERT INTO cards (id, project_id, title, description, status, substatus, position, created_at, updated_at)
    SELECT id, '${defaultId}', title, description, status, NULL, position, created_at, updated_at
    FROM cards_v1;

    -- Drop old table and index
    DROP TABLE cards_v1;

    -- Create new index
    CREATE INDEX IF NOT EXISTS idx_cards_project_status ON cards(project_id, status, position);
  `);

  console.log(`Migration complete: assigned ${db.prepare('SELECT count(*) as n FROM cards').get().n} cards to Default project (${defaultId})`);
}

/**
 * Ensure a Default project exists. Returns its ID.
 */
function ensureDefaultProject() {
  const existing = db.prepare('SELECT id FROM projects LIMIT 1').get();
  if (existing) return existing.id;

  const id = projectId();
  db.prepare(`
    INSERT INTO projects (id, name, description, columns, created_at, updated_at)
    VALUES (?, 'Default', '', ?, datetime('now'), datetime('now'))
  `).run(id, DEFAULT_COLUMNS);

  console.log(`Created Default project: ${id}`);
  return id;
}

module.exports = { db, initSchema, DEFAULT_COLUMNS };
