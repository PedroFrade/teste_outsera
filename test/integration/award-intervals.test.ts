import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { OFFICIAL_CSV, fixture } from '../helpers/paths.js';

const ROUTE = '/producers/award-intervals';

async function getIntervals(csvPath: string) {
  const app = await buildApp({ csvPath });
  try {
    const res = await app.inject({ method: 'GET', url: ROUTE });
    assert.equal(res.statusCode, 200);
    return res.json();
  } finally {
    await app.close();
  }
}

describe('GET /producers/award-intervals: official CSV', () => {
  it('returns exactly the expected min and max', async () => {
    assert.deepStrictEqual(await getIntervals(OFFICIAL_CSV), {
      min: [{ producer: 'Joel Silver', interval: 1, previousWin: 1990, followingWin: 1991 }],
      max: [{ producer: 'Matthew Vaughn', interval: 13, previousWin: 2002, followingWin: 2015 }],
    });
  });

  it('responds as JSON and is idempotent across requests', async () => {
    const app = await buildApp({ csvPath: OFFICIAL_CSV });
    const first = await app.inject({ method: 'GET', url: ROUTE });
    const second = await app.inject({ method: 'GET', url: ROUTE });
    await app.close();
    assert.match(String(first.headers['content-type']), /^application\/json/);
    assert.deepStrictEqual(second.json(), first.json());
  });

  it('rejects methods other than GET with 405 and Allow', async () => {
    const app = await buildApp({ csvPath: OFFICIAL_CSV });
    const res = await app.inject({ method: 'DELETE', url: ROUTE });
    await app.close();
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
  });
});

// Each fixture's expected result was worked out by hand from the CSV rows.
describe('GET /producers/award-intervals: scenarios', () => {
  it('ties in min and in max with different producers; non-winners are ignored', async () => {
    // Alice 2000->2001 and Bob 2010->2011 tie at 1. Carol 1980->1990 and Dan 1985->1995 tie at
    // 10. Alice's 2005 nomination is not a win, so it must not create a 2001->2005 pair.
    assert.deepStrictEqual(await getIntervals(fixture('intervals-ties.csv')), {
      min: [
        { producer: 'Alice', interval: 1, previousWin: 2000, followingWin: 2001 },
        { producer: 'Bob', interval: 1, previousWin: 2010, followingWin: 2011 },
      ],
      max: [
        { producer: 'Carol', interval: 10, previousWin: 1980, followingWin: 1990 },
        { producer: 'Dan', interval: 10, previousWin: 1985, followingWin: 1995 },
      ],
    });
  });

  it('counts only consecutive wins, whatever the order of the rows', async () => {
    // Eve wins in 1980, 1982, 1990, 2000: consecutive gaps are 2, 8 and 10 (1980->2000 is not a
    // pair). Fay wins in 1990 and 2005: 15.
    assert.deepStrictEqual(await getIntervals(fixture('intervals-multiple.csv')), {
      min: [{ producer: 'Eve', interval: 2, previousWin: 1980, followingWin: 1982 }],
      max: [{ producer: 'Fay', interval: 15, previousWin: 1990, followingWin: 2005 }],
    });
  });

  it('the same producer can be in both min and max', async () => {
    // Hal wins in 1980, 1981 and 2000: gaps 1 and 19. Ivy: 5.
    assert.deepStrictEqual(await getIntervals(fixture('intervals-same-producer.csv')), {
      min: [{ producer: 'Hal', interval: 1, previousWin: 1980, followingWin: 1981 }],
      max: [{ producer: 'Hal', interval: 19, previousWin: 1981, followingWin: 2000 }],
    });
  });

  it('returns empty arrays when no producer has two wins', async () => {
    // Gus has one win and one nomination; Ike and Joy share a single win.
    assert.deepStrictEqual(await getIntervals(fixture('intervals-no-repeat.csv')), {
      min: [],
      max: [],
    });
  });

  it('two wins in the same year give interval 0', async () => {
    // Jo: 1990->1990 (0). Lou wins three films in 1999, which is reported once. Kai: 5.
    assert.deepStrictEqual(await getIntervals(fixture('intervals-same-year.csv')), {
      min: [
        { producer: 'Jo', interval: 0, previousWin: 1990, followingWin: 1990 },
        { producer: 'Lou', interval: 0, previousWin: 1999, followingWin: 1999 },
      ],
      max: [{ producer: 'Kai', interval: 5, previousWin: 1980, followingWin: 1985 }],
    });
  });

  it('handles BOM, CRLF, quotes, blank lines, Oxford comma, extra spaces and Yes/YES', async () => {
    // Bo Kim (listed as "  Bo   Kim  and Dee Fox ") wins 1990 and 1991: 1. Cy Doe (after the
    // Oxford comma, and quoted) wins 1990 and 1995: 5. Ann Lee's 2000 film is not a win.
    assert.deepStrictEqual(await getIntervals(fixture('intervals-formatting.csv')), {
      min: [{ producer: 'Bo Kim', interval: 1, previousWin: 1990, followingWin: 1991 }],
      max: [{ producer: 'Cy Doe', interval: 5, previousWin: 1990, followingWin: 1995 }],
    });
  });

  it('ignores a row with an invalid year without breaking the import', async () => {
    // The "abc" row is dropped: Max wins 2000 and 2010 (10) and Nia 2001 and 2003 (2).
    assert.deepStrictEqual(await getIntervals(fixture('intervals-invalid-year.csv')), {
      min: [{ producer: 'Nia', interval: 2, previousWin: 2001, followingWin: 2003 }],
      max: [{ producer: 'Max', interval: 10, previousWin: 2000, followingWin: 2010 }],
    });
  });

  it('starts with a header-only CSV and returns empty arrays', async () => {
    assert.deepStrictEqual(await getIntervals(fixture('header-only.csv')), { min: [], max: [] });
  });

  it('does not start when the header lacks a required column', async () => {
    await assert.rejects(
      buildApp({ csvPath: fixture('missing-column.csv') }),
      /missing required column\(s\): producers/,
    );
  });
});
