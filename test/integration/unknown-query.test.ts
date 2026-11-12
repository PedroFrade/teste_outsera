import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { OFFICIAL_CSV } from '../helpers/paths.js';

const PROBLEM_JSON = /^application\/problem\+json/;

describe('unknown query parameters', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp({ csvPath: OFFICIAL_CSV });
  });
  after(() => app.close());

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('rejects a misspelled parameter instead of returning the first page', async () => {
    const res = await get('/movies?cursos=eyJpZCI6MTF9');
    assert.equal(res.statusCode, 400);
    assert.match(String(res.headers['content-type']), PROBLEM_JSON);
    const body = res.json();
    assert.equal(body.status, 400);
    assert.equal(body.title, 'Bad Request');
    assert.equal(body.instance, '/movies?cursos=eyJpZCI6MTF9');
    assert.equal(body.traceId, res.headers['x-request-id']);
    assert.deepStrictEqual(body.errors, [
      { in: 'querystring', field: 'cursos', message: 'is not a known parameter' },
    ]);
  });

  it('lists every unknown parameter, even next to valid ones', async () => {
    const res = await get('/movies?limit=2&cursos=x&foo=1&winner=true');
    assert.equal(res.statusCode, 400);
    const fields = res.json().errors.map((e: { field: string }) => e.field);
    assert.deepStrictEqual(fields, ['cursos', 'foo']);
  });

  it('rejects an unknown parameter that is repeated or has no value', async () => {
    for (const query of ['foo=1&foo=2', 'foo']) {
      const res = await get(`/movies?${query}`);
      assert.equal(res.statusCode, 400, query);
      assert.equal(res.json().errors[0].field, 'foo', query);
    }
  });

  it('is case-sensitive: Limit is not limit', async () => {
    const res = await get('/movies?Limit=2');
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().errors[0].field, 'Limit');
  });

  it('applies to routes with no querystring schema', async () => {
    for (const path of ['/health', '/producers/award-intervals', '/movies/1']) {
      const res = await get(`${path}?foo=1`);
      assert.equal(res.statusCode, 400, path);
      assert.match(String(res.headers['content-type']), PROBLEM_JSON, path);
      assert.equal(res.json().errors[0].field, 'foo', path);
    }
  });

  it('still accepts every declared parameter', async () => {
    assert.equal((await get('/movies?winner=true&year=1980&limit=5')).statusCode, 200);
    const first = await get('/movies?limit=1');
    const next = await get(`/movies?limit=1&cursor=${first.json().page.nextCursor}`);
    assert.equal(next.statusCode, 200);
    assert.equal((await get('/health')).statusCode, 200);
  });

  it('keeps 404 and 405 for unmatched routes that carry a query string', async () => {
    const notFound = await get('/nope?foo=1');
    assert.equal(notFound.statusCode, 404);
    const notAllowed = await app.inject({ method: 'POST', url: '/health?foo=1' });
    assert.equal(notAllowed.statusCode, 405);
  });
});
