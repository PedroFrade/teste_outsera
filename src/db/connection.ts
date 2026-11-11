import Database from 'better-sqlite3';

/** Opens the in-memory database. Nothing is ever written to disk. */
export function openDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}
