import { paths } from './storage.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let dbInstance = null;

export function openDb() {
  if (dbInstance) return dbInstance;
  // Uses Node's built-in SQLite (Node 22+): https://nodejs.org/api/sqlite.html
  // This avoids native addon rebuild issues.
  const { DatabaseSync } = require('node:sqlite');
  dbInstance = new DatabaseSync(paths.dbFile);
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) throw new Error('Database not opened yet');
  return dbInstance;
}

export function initDb(dbConn) {
  dbConn.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      working_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS template_fields (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      json_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (template_id, json_path),
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_keys (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      find_text TEXT NOT NULL,
      json_path TEXT NOT NULL,
      var_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS json_inputs (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS generated_docs (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      output_filename TEXT NOT NULL,
      output_path TEXT NOT NULL,
      input_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );
  `);
}
