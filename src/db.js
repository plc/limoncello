/**
 * Database connection and schema initialization (SQLite)
 *
 * Exports:
 *   db         -- better-sqlite3 instance
 *   initSchema() -- creates tables and indexes (idempotent)
 *
 * Database file: ./data/prello.db (created automatically)
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'prello.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Create all tables and indexes. Safe to call on every startup.
 */
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      description TEXT DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'backlog'
                   CHECK (status IN ('backlog', 'todo', 'in_progress', 'done')),
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status, position);
  `);
}

module.exports = { db, initSchema };
