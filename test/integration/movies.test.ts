import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { fetchAllMovies, type MovieJson } from '../helpers/api.js';
import { OFFICIAL_CSV } from '../helpers/paths.js';

const PROBLEM_JSON = /^application\/problem\+json/;

describe('GET /movies and GET /movies/:id (official CSV)', () => {
  let app: FastifyInstance;
  let all: MovieJson[];

  before(async () => {
    app = await buildApp({ csvPath: OFFICIAL_CSV });
    all = await fetchAllMovies(app);
  });
  after(() => app.close());

  async function get(url: string) {
    return app.inject({ method: 'GET', url });
  }

  describe('totals and content', () => {
    it('lists 206 movies and 42 winners, matching the CSV', () => {
      assert.equal(all.length, 206);
      assert.equal(all.filter((m) => m.winner).length, 42);
    });

    it('returns movies in CSV order with producers and studios as arrays', () => {
      assert.deepStrictEqual(all[0], {
        id: 1,
        year: 1980,
        title: "Can't Stop the Music",
        winner: true,
        producers: ['Allan Carr'],
        studios: ['Associated Film Distribution'],
      });
      const titles = all.map((m) => m.title);
      assert.equal(titles[1], 'Cruising');
      assert.equal(titles.at(-1), 'Rambo: Last Blood');
    });

    it('splits producers on "and"', () => {
      assert.deepStrictEqual(
        all.find((m) => m.title === 'The Adventures of Ford Fairlane'),
        {
          id: 56,
          year: 1990,
          title: 'The Adventures of Ford Fairlane',
          winner: true,
          producers: ['Steven Perry', 'Joel Silver'],
          studios: ['20th Century Fox'],
        },
      );
    });

    it('splits producers on commas and on the Oxford comma', () => {
      assert.deepStrictEqual(
        all.find((m) => m.title === 'Cats'),
        {
          id: 202,
          year: 2019,
          title: 'Cats',
          winner: true,
          producers: ['Debra Hayward', 'Tim Bevan', 'Eric Fellner', 'Tom Hooper'],
          studios: ['Universal Pictures'],
        },
      );
    });

    it('splits several producers and studios, keeping the typo from the CSV', () => {
      assert.deepStrictEqual(
        all.find((m) => m.title === 'A Thousand Words'),
        {
          id: 170,
          year: 2012,
          title: 'A Thousand Words',
          winner: false,
          producers: [
            'Nicolas Cage',
            'Alain Chabat',
            'Stephanie Danan',
            'Norman Golightly',
            'Brian Robbinsand Sharla Sumpter Bridgett',
          ],
          studios: ['Paramount Pictures', 'DreamWorks'],
        },
      );
    });
  });

  describe('pagination', () => {
    it('returns the default page size and a cursor', async () => {
      const body = (await get('/movies')).json();
      assert.equal(body.data.length, 50);
      assert.equal(body.page.limit, 50);
      assert.equal(body.page.hasMore, true);
      assert.equal(typeof body.page.nextCursor, 'string');
    });

    it('walks every page without repeating or losing a record', async () => {
      for (const limit of [1, 7, 50, 205, 206, 500]) {
        const walked = await fetchAllMovies(app, '', limit);
        assert.deepStrictEqual(
          walked.map((m) => m.id),
          all.map((m) => m.id),
          `limit=${limit}`,
        );
      }
    });

    it('ends with hasMore=false and a null cursor on the last page', async () => {
      const body = (await get('/movies?limit=500')).json();
      assert.equal(body.data.length, 206);
      assert.deepStrictEqual(body.page, { limit: 500, nextCursor: null, hasMore: false });
    });

    it('is exact when the total is a multiple of the page size', async () => {
      const second = (await get('/movies?limit=103')).json();
      const last = (await get(`/movies?limit=103&cursor=${second.page.nextCursor}`)).json();
      assert.equal(last.data.length, 103);
      assert.deepStrictEqual(last.page, { limit: 103, nextCursor: null, hasMore: false });
    });
  });

  describe('filters', () => {
    it('filters winners with winner=true and winner=false', async () => {
      const winners = await fetchAllMovies(app, 'winner=true');
      assert.equal(winners.length, 42);
      assert.ok(winners.every((m) => m.winner));
      const others = await fetchAllMovies(app, 'winner=false');
      assert.equal(others.length, 164);
      assert.ok(others.every((m) => !m.winner));
    });

    it('filters by year', async () => {
      const movies = await fetchAllMovies(app, 'year=1990');
      assert.equal(movies.length, 5);
      assert.ok(movies.every((m) => m.year === 1990));
    });

    it('combines winner and year', async () => {
      const movies = await fetchAllMovies(app, 'winner=true&year=1990');
      assert.deepStrictEqual(
        movies.map((m) => m.title),
        ['The Adventures of Ford Fairlane', "Ghosts Can't Do It"],
      );
    });

    it('paginates a filtered list', async () => {
      const walked = await fetchAllMovies(app, 'winner=false', 10);
      assert.equal(walked.length, 164);
      assert.equal(new Set(walked.map((m) => m.id)).size, 164);
    });

    it('returns an empty page when nothing matches', async () => {
      const res = await get('/movies?year=1800');
      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(res.json(), {
        data: [],
        page: { limit: 50, nextCursor: null, hasMore: false },
      });
    });
  });

  describe('GET /movies/:id', () => {
    it('returns the same movie as the list', async () => {
      const res = await get('/movies/202');
      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(
        res.json(),
        all.find((m) => m.id === 202),
      );
    });

    it('returns 404 as Problem Details for an unknown id', async () => {
      const res = await get('/movies/999999');
      assert.equal(res.statusCode, 404);
      assert.match(String(res.headers['content-type']), PROBLEM_JSON);
      const body = res.json();
      assert.equal(body.status, 404);
      assert.equal(body.title, 'Not Found');
      assert.equal(body.detail, 'Movie 999999 not found');
      assert.equal(body.instance, '/movies/999999');
      assert.equal(body.traceId, res.headers['x-request-id']);
    });

    it('returns 400 for a non-integer or non-positive id', async () => {
      for (const id of ['abc', '1.5', '0', '-3']) {
        const res = await get(`/movies/${id}`);
        assert.equal(res.statusCode, 400, `id=${id}`);
        assert.equal(res.json().errors[0].in, 'params');
      }
    });
  });

  describe('validation errors (400)', () => {
    const cases: [string, string][] = [
      ['limit=0', 'limit'],
      ['limit=10000', 'limit'],
      ['limit=abc', 'limit'],
      ['year=abc', 'year'],
      ['year=1990.5', 'year'],
      ['winner=maybe', 'winner'],
      ['winner=1', 'winner'], // only true/false are accepted
      ['cursor=not-a-cursor!!', 'cursor'],
      ['cursor=aGVsbG8', 'cursor'], // base64url of "hello": decodes, but is not a cursor
      [`cursor=${Buffer.from('{"id":-1}').toString('base64url')}`, 'cursor'],
      [`cursor=${Buffer.from('{"id":"7"}').toString('base64url')}`, 'cursor'],
      [`cursor=${Buffer.from('{"id":1,"x":2}').toString('base64url')}`, 'cursor'],
    ];

    for (const [query, field] of cases) {
      it(`rejects ${query.slice(0, 40)}`, async () => {
        const res = await get(`/movies?${query}`);
        assert.equal(res.statusCode, 400);
        assert.match(String(res.headers['content-type']), PROBLEM_JSON);
        const body = res.json();
        assert.equal(body.status, 400);
        assert.equal(body.title, 'Bad Request');
        assert.equal(body.type, 'about:blank');
        assert.equal(body.instance, `/movies?${query}`);
        assert.equal(body.traceId, res.headers['x-request-id']);
        assert.equal(body.errors.length, 1);
        assert.equal(body.errors[0].field, field);
        assert.equal(typeof body.errors[0].message, 'string');
      });
    }

    it('lists every invalid field', async () => {
      const res = await get('/movies?limit=0&year=abc');
      const fields = res.json().errors.map((e: { field: string }) => e.field);
      assert.deepStrictEqual(fields.sort(), ['limit', 'year']);
    });
  });

  describe('HTTP semantics', () => {
    it('answers 405 with Allow for write methods on the collection and on an item', async () => {
      for (const [method, url] of [
        ['POST', '/movies'],
        ['DELETE', '/movies'],
        ['PUT', '/movies/1'],
        ['PATCH', '/movies/1'],
        ['DELETE', '/movies/1'],
      ] as const) {
        const res = await app.inject({ method, url });
        assert.equal(res.statusCode, 405, `${method} ${url}`);
        assert.equal(res.headers.allow, 'GET, HEAD');
        assert.match(String(res.headers['content-type']), PROBLEM_JSON);
      }
    });

    it('answers 404 for a path that does not exist', async () => {
      assert.equal((await get('/movies/1/producers')).statusCode, 404);
    });

    it('propagates x-request-id on success and on error', async () => {
      const ok = await app.inject({
        method: 'GET',
        url: '/movies/1',
        headers: { 'x-request-id': 'trace-ok' },
      });
      assert.equal(ok.headers['x-request-id'], 'trace-ok');
      const bad = await app.inject({
        method: 'GET',
        url: '/movies?limit=0',
        headers: { 'x-request-id': 'trace-bad' },
      });
      assert.equal(bad.json().traceId, 'trace-bad');
    });
  });
});
