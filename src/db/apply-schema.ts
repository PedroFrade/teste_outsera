import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/** Applies the versioned schema. The schema is never inferred from the CSV. */
export function applySchema(db: Database.Database): void {
  db.exec(schema);
}
