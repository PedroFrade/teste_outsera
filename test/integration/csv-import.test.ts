import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { buildApp } from '../../src/app.js';
import { applySchema } from '../../src/db/apply-schema.js';
import { openDatabase } from '../../src/db/connection.js';
import { importCsv } from '../../src/importer/import-csv.js';
import { OFFICIAL_CSV, fixture } from '../helpers/paths.js';

type Log = Parameters<typeof importCsv>[2];

interface Warning {
  context: Record<string, unknown>;
  message: string;
}

function captureLog(): { log: Log; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const log = {
    info: () => {},
    warn: (context: Record<string, unknown>, message: string) =>
      warnings.push({ context, message }),
  } as unknown as Log;
  return { log, warnings };
}

async function load(csvPath: string) {
  const db = openDatabase();
  applySchema(db);
  const { log, warnings } = captureLog();
  const summary = await importCsv(db, csvPath, log);
  return { db, summary, warnings };
}

interface MovieView {
  year: number;
  winner: number;
  producers: string[];
  studios: string[];
}

function movie(db: Database.Database, title: string): MovieView {
  const row = db.prepare('SELECT id, year, winner FROM movies WHERE title = ?').get(title) as
    { id: number; year: number; winner: number } | undefined;
  assert.ok(row, `movie "${title}" was not imported`);
  const names = (sql: string) =>
    (db.prepare(sql).all(row.id) as { name: string }[]).map((r) => r.name).sort();
  return {
    year: row.year,
    winner: row.winner,
    producers: names(
      'SELECT p.name FROM movie_producers mp JOIN producers p ON p.id = mp.producer_id WHERE mp.movie_id = ?',
    ),
    studios: names(
      'SELECT s.name FROM movie_studios ms JOIN studios s ON s.id = ms.studio_id WHERE ms.movie_id = ?',
    ),
  };
}

function count(db: Database.Database, sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

describe('CSV import: official file', () => {
  it('imports every row with the expected totals and no warnings', async () => {
    const { db, summary, warnings } = await load(OFFICIAL_CSV);
    assert.deepStrictEqual(summary, { read: 206, imported: 206, skipped: 0 });
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM movies'), 206);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM movies WHERE winner = 1'), 42);
    assert.deepStrictEqual(warnings, []);
  });

  it('stores movies exactly as in the CSV, splitting producers and studios', async () => {
    const { db } = await load(OFFICIAL_CSV);

    assert.deepStrictEqual(movie(db, "Can't Stop the Music"), {
      year: 1980,
      winner: 1,
      producers: ['Allan Carr'],
      studios: ['Associated Film Distribution'],
    });
    // "and" separator.
    assert.deepStrictEqual(movie(db, 'The Adventures of Ford Fairlane'), {
      year: 1990,
      winner: 1,
      producers: ['Joel Silver', 'Steven Perry'],
      studios: ['20th Century Fox'],
    });
    // Oxford comma: ", and ".
    assert.deepStrictEqual(movie(db, 'Cats'), {
      year: 2019,
      winner: 1,
      producers: ['Debra Hayward', 'Eric Fellner', 'Tim Bevan', 'Tom Hooper'],
      studios: ['Universal Pictures'],
    });
    // Commas plus a typo in the data, which must be kept as is.
    assert.deepStrictEqual(movie(db, 'A Thousand Words'), {
      year: 2012,
      winner: 0,
      producers: [
        'Alain Chabat',
        'Brian Robbinsand Sharla Sumpter Bridgett',
        'Nicolas Cage',
        'Norman Golightly',
        'Stephanie Danan',
      ],
      studios: ['DreamWorks', 'Paramount Pictures'],
    });
  });

  it('shares one producer row across movies', async () => {
    const { db } = await load(OFFICIAL_CSV);
    const joelSilverWins = count(
      db,
      `SELECT COUNT(*) AS n FROM movie_producers mp
         JOIN producers p ON p.id = mp.producer_id
         JOIN movies m ON m.id = mp.movie_id
        WHERE p.name = 'Joel Silver' AND m.winner = 1`,
    );
    assert.equal(joelSilverWins, 2);
    assert.equal(count(db, "SELECT COUNT(*) AS n FROM producers WHERE name = 'Joel Silver'"), 1);
  });
});

describe('CSV import: messy file', () => {
  // BOM, CRLF, odd header case/spacing, an extra column, quoted fields with ";" and "", a blank
  // line, Yes/YES, Oxford comma, extra spaces, a duplicated producer, an invalid year (line 6)
  // and an empty title (line 7).
  it('imports valid rows and skips invalid ones with a warning per line', async () => {
    const { summary, warnings } = await load(fixture('import-messy.csv'));
    assert.deepStrictEqual(summary, { read: 7, imported: 5, skipped: 2 });

    const lineWarnings = warnings.filter((w) => 'line' in w.context);
    assert.deepStrictEqual(
      lineWarnings.map((w) => w.context.line),
      [6, 7],
    );
    assert.match(lineWarnings[0]!.message, /invalid year "abc"/);
    assert.match(lineWarnings[1]!.message, /empty title/);
  });

  it('ends with a warning that the data may affect the results', async () => {
    const { warnings } = await load(fixture('import-messy.csv'));
    const last = warnings.at(-1)!;
    assert.deepStrictEqual(last.context, { read: 7, imported: 5, skipped: 2 });
    assert.match(last.message, /2 ignored line\(s\).*may be affected/);
  });

  it('parses names, winner flag and quoting correctly', async () => {
    const { db } = await load(fixture('import-messy.csv'));

    assert.deepStrictEqual(movie(db, 'Movie A; The Sequel'), {
      year: 1990,
      winner: 1, // "YES"
      producers: ['Ann One', 'Bob Two', 'Cy Three'], // Oxford comma
      studios: ['Studio X', 'Studio Y'],
    });
    assert.deepStrictEqual(movie(db, 'Movie B'), {
      year: 1991,
      winner: 1, // "yes"
      producers: ['Dee Four', 'Eve Five'], // extra spaces collapsed
      studios: ['Studio X'],
    });
    assert.equal(movie(db, 'Movie C').winner, 0); // "no"
    assert.deepStrictEqual(movie(db, 'Movie D'), {
      year: 1994,
      winner: 1, // "Yes"
      producers: ['Gus Six'], // duplicate within the movie
      studios: ['Studio Z'],
    });
    assert.equal(movie(db, 'Quote "Q" Movie').winner, 0); // "maybe" is not a win
  });

  it('does not store the ignored rows', async () => {
    const { db } = await load(fixture('import-messy.csv'));
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM movies'), 5);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM producers'), 7);
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM studios'), 3);
  });

  it('lets the app start with the messy file', async () => {
    const app = await buildApp({ csvPath: fixture('import-messy.csv') });
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    await app.close();
  });
});

describe('CSV import: structural errors', () => {
  it('imports nothing, with a warning, from a file with only the header', async () => {
    const { db, summary, warnings } = await load(fixture('header-only.csv'));
    assert.deepStrictEqual(summary, { read: 0, imported: 0, skipped: 0 });
    assert.equal(count(db, 'SELECT COUNT(*) AS n FROM movies'), 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!.message, /no data rows/);
  });

  it('buildApp rejects when a required column is missing', async () => {
    await assert.rejects(
      buildApp({ csvPath: fixture('missing-column.csv') }),
      /missing required column\(s\): producers/,
    );
  });

  it('buildApp rejects with a clear message when the file does not exist', async () => {
    await assert.rejects(
      buildApp({ csvPath: fixture('does-not-exist.csv') }),
      /CSV file not found: .*does-not-exist\.csv/,
    );
  });
});
