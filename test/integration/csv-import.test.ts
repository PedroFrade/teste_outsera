import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { OFFICIAL_CSV, fixture } from '../helpers/paths.js';
import { WARN, captureLogs, fetchAllMovies, withApp, type MovieJson } from '../helpers/api.js';

/** Starts the app on `csvPath`, then returns every movie served by the API plus the startup logs. */
async function importThroughApi(csvPath: string) {
  const { logger, records } = captureLogs();
  const movies = await withApp(csvPath, (app) => fetchAllMovies(app, '', 500), logger);
  return { movies, records };
}

const byTitle = (movies: MovieJson[], title: string) => movies.find((m) => m.title === title);

describe('CSV import: official file', () => {
  it('serves every row, with the expected totals and no warnings', async () => {
    const { movies, records } = await importThroughApi(OFFICIAL_CSV);
    assert.equal(movies.length, 206);
    assert.equal(movies.filter((m) => m.winner).length, 42);
    assert.deepStrictEqual(
      records.filter((r) => r.level >= WARN),
      [],
    );
    const summary = records.find((r) => r.msg === 'CSV import finished');
    assert.ok(summary);
    assert.deepStrictEqual(
      { read: summary.read, imported: summary.imported, skipped: summary.skipped },
      { read: 206, imported: 206, skipped: 0 },
    );
  });

  it('stores movies exactly as in the CSV, splitting producers and studios', async () => {
    const { movies } = await importThroughApi(OFFICIAL_CSV);

    assert.deepStrictEqual(byTitle(movies, "Can't Stop the Music"), {
      id: 1,
      year: 1980,
      title: "Can't Stop the Music",
      winner: true,
      producers: ['Allan Carr'],
      studios: ['Associated Film Distribution'],
    });
    // "and" separator.
    assert.deepStrictEqual(byTitle(movies, 'The Adventures of Ford Fairlane')?.producers, [
      'Steven Perry',
      'Joel Silver',
    ]);
    // Oxford comma: ", and ".
    assert.deepStrictEqual(byTitle(movies, 'Cats')?.producers, [
      'Debra Hayward',
      'Tim Bevan',
      'Eric Fellner',
      'Tom Hooper',
    ]);
    // Commas plus a typo in the data, which must be kept as is.
    assert.deepStrictEqual(byTitle(movies, 'A Thousand Words')?.producers, [
      'Nicolas Cage',
      'Alain Chabat',
      'Stephanie Danan',
      'Norman Golightly',
      'Brian Robbinsand Sharla Sumpter Bridgett',
    ]);
  });
});

describe('CSV import: messy file', () => {
  // BOM, CRLF, odd header case/spacing, an extra column, quoted fields with ";" and "", a blank
  // line, Yes/YES, Oxford comma, extra spaces, a duplicated producer, an invalid year (line 6)
  // and an empty title (line 7).
  it('serves the valid rows and logs one warning per ignored line', async () => {
    const { movies, records } = await importThroughApi(fixture('import-messy.csv'));
    assert.equal(movies.length, 5);

    const lineWarnings = records.filter((r) => r.level === WARN && 'line' in r);
    assert.deepStrictEqual(
      lineWarnings.map((r) => r.line),
      [6, 7],
    );
    assert.match(lineWarnings[0]!.msg, /invalid year "abc"/);
    assert.match(lineWarnings[1]!.msg, /empty title/);
  });

  it('ends with a warning that the results may be affected', async () => {
    const { records } = await importThroughApi(fixture('import-messy.csv'));
    const last = records.filter((r) => r.level === WARN).at(-1)!;
    assert.deepStrictEqual(
      { read: last.read, imported: last.imported, skipped: last.skipped },
      { read: 7, imported: 5, skipped: 2 },
    );
    assert.match(last.msg, /2 ignored line\(s\).*may be affected/);
  });

  it('parses names, winner flag and quoting correctly', async () => {
    const { movies } = await importThroughApi(fixture('import-messy.csv'));

    assert.deepStrictEqual(byTitle(movies, 'Movie A; The Sequel'), {
      id: 1,
      year: 1990,
      title: 'Movie A; The Sequel',
      winner: true, // "YES"
      producers: ['Ann One', 'Bob Two', 'Cy Three'], // Oxford comma
      studios: ['Studio X', 'Studio Y'],
    });
    assert.deepStrictEqual(byTitle(movies, 'Movie B'), {
      id: 2,
      year: 1991,
      title: 'Movie B',
      winner: true, // "yes"
      producers: ['Dee Four', 'Eve Five'], // extra spaces collapsed
      studios: ['Studio X'],
    });
    assert.equal(byTitle(movies, 'Movie C')?.winner, false); // "no"
    assert.deepStrictEqual(byTitle(movies, 'Movie D'), {
      id: 4,
      year: 1994,
      title: 'Movie D',
      winner: true, // "Yes"
      producers: ['Gus Six'], // duplicate within the movie
      studios: ['Studio Z'],
    });
    assert.equal(byTitle(movies, 'Quote "Q" Movie')?.winner, false); // "maybe" is not a win
  });

  it('does not serve the ignored rows', async () => {
    const { movies } = await importThroughApi(fixture('import-messy.csv'));
    assert.deepStrictEqual(
      movies.map((m) => m.title),
      ['Movie A; The Sequel', 'Movie B', 'Movie C', 'Movie D', 'Quote "Q" Movie'],
    );
    // Names shared across movies are the same producer/studio, not duplicates.
    assert.equal(new Set(movies.flatMap((m) => m.producers)).size, 7);
    assert.equal(new Set(movies.flatMap((m) => m.studios)).size, 3);
  });
});

describe('CSV import: unusual files', () => {
  it('starts with a header-only file, with a warning and no movies', async () => {
    const { movies, records } = await importThroughApi(fixture('header-only.csv'));
    assert.deepStrictEqual(movies, []);
    const warnings = records.filter((r) => r.level === WARN);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!.msg, /no data rows/);
  });

  it('buildApp rejects when a required column is missing', async () => {
    await assert.rejects(
      buildApp({ csvPath: fixture('missing-column.csv') }),
      /missing required column\(s\): producers/,
    );
  });

  it('buildApp rejects a malformed CSV instead of importing part of it', async () => {
    // A stray quote on line 3 (reported there)...
    await assert.rejects(
      buildApp({ csvPath: fixture('malformed.csv') }),
      /Malformed CSV near line 3/,
    );
    // ...and a quote opened on line 2 that is never closed (the parser gives up at the end of
    // the file, so only the kind of error is asserted, not the line).
    await assert.rejects(
      buildApp({ csvPath: fixture('unclosed-quote.csv') }),
      /Malformed CSV near line \d+: Quote Not Closed/,
    );
  });

  it('buildApp rejects with a clear message when the file does not exist', async () => {
    await assert.rejects(
      buildApp({ csvPath: fixture('does-not-exist.csv') }),
      /CSV file not found: .*does-not-exist\.csv/,
    );
  });
});
