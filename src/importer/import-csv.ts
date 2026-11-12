import type Database from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import { readCsv, type CsvRow } from './csv-reader.js';
import { splitNames } from './parse-names.js';

export interface ImportSummary {
  read: number;
  imported: number;
  skipped: number;
}

type ImportLogger = Pick<FastifyBaseLogger, 'info' | 'warn'>;

/** Returns why a row cannot be imported, or the clean values when it can. */
function validate(row: CsvRow): { year: number; title: string } | string {
  const year = row.year.trim();
  if (!/^\d+$/.test(year) || !Number.isSafeInteger(Number(year))) {
    return `invalid year "${row.year}"`;
  }
  if (row.title.trim() === '') return 'empty title';
  return { year: Number(year), title: row.title.trim() };
}

function isBlank(row: CsvRow): boolean {
  return [row.year, row.title, row.studios, row.producers, row.winner].every((v) => v === '');
}

/**
 * Returns a function that gives the id of a name, inserting it the first time it is seen. Ids are
 * remembered in a Map for the duration of the import: a name that repeats across thousands of
 * movies then costs a lookup in memory instead of a write to the database.
 */
function idResolver(insert: Database.Statement): (name: string) => number {
  const ids = new Map<string, number>();
  return (name) => {
    let id = ids.get(name);
    if (id === undefined) {
      id = Number(insert.run(name).lastInsertRowid);
      ids.set(name, id);
    }
    return id;
  };
}

/**
 * Loads the CSV into the database in a single transaction, using prepared statements created
 * once. Invalid rows are skipped with a warning and never abort the import; structural errors
 * (missing file, missing column, malformed CSV) roll everything back and are rethrown.
 *
 * The transaction is opened manually because the CSV is consumed asynchronously (streaming),
 * and better-sqlite3's `db.transaction()` only wraps synchronous functions. This is safe since
 * nothing else touches the connection while the app is still starting.
 */
export async function importCsv(
  db: Database.Database,
  csvPath: string,
  log: ImportLogger,
): Promise<ImportSummary> {
  const insertMovie = db.prepare('INSERT INTO movies (year, title, winner) VALUES (?, ?, ?)');
  const producerId = idResolver(db.prepare('INSERT INTO producers (name) VALUES (?)'));
  const studioId = idResolver(db.prepare('INSERT INTO studios (name) VALUES (?)'));
  const linkProducer = db.prepare(
    'INSERT INTO movie_producers (movie_id, producer_id) VALUES (?, ?)',
  );
  const linkStudio = db.prepare('INSERT INTO movie_studios (movie_id, studio_id) VALUES (?, ?)');

  const summary: ImportSummary = { read: 0, imported: 0, skipped: 0 };

  db.exec('BEGIN');
  try {
    for await (const row of readCsv(csvPath)) {
      // A row with every field empty (e.g. ";;;;") is a blank line, not data.
      if (isBlank(row)) continue;
      summary.read++;

      const checked = validate(row);
      if (typeof checked === 'string') {
        summary.skipped++;
        log.warn({ line: row.line }, `CSV line ${row.line} ignored: ${checked}`);
        continue;
      }

      const winner = row.winner.trim().toLowerCase() === 'yes' ? 1 : 0;
      const movieId = Number(insertMovie.run(checked.year, checked.title, winner).lastInsertRowid);
      for (const name of splitNames(row.producers)) linkProducer.run(movieId, producerId(name));
      for (const name of splitNames(row.studios)) linkStudio.run(movieId, studioId(name));
      summary.imported++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  if (summary.read === 0) {
    // Not an error: the app starts and the API answers with empty results.
    log.warn(summary, 'CSV has a header but no data rows: nothing was imported');
  } else if (summary.skipped > 0) {
    log.warn(
      summary,
      `CSV import finished with ${summary.skipped} ignored line(s): the data is incomplete, ` +
        'so results such as award intervals may be affected. See the warnings above.',
    );
  } else {
    log.info(summary, 'CSV import finished');
  }
  return summary;
}
