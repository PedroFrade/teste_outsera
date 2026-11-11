import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

describe('health and error handling', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
    // Test-only route, registered before the app is ready, to exercise the 500 path.
    app.get('/boom', () => {
      throw new Error('secret internal detail');
    });
  });
  after(() => app.close());

  it('GET /health returns 200 { status: "ok" }', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    assert.deepStrictEqual(res.json(), { status: 'ok' });
  });

  it('unknown route returns 404 as Problem Details', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    assert.equal(res.statusCode, 404);
    assert.match(String(res.headers['content-type']), /^application\/problem\+json/);
    const body = res.json();
    assert.equal(body.status, 404);
    assert.equal(body.title, 'Not Found');
    assert.equal(body.type, 'about:blank');
    assert.equal(body.instance, '/nope');
    assert.equal(body.traceId, res.headers['x-request-id']);
  });

  it('unsupported method on an existing route returns 405 with Allow', async () => {
    const res = await app.inject({ method: 'POST', url: '/health' });
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
    assert.equal(res.json().status, 405);
  });

  it('propagates x-request-id and uses it as traceId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { 'x-request-id': 'abc-123' },
    });
    assert.equal(res.headers['x-request-id'], 'abc-123');
    assert.equal(res.json().traceId, 'abc-123');
  });

  it('generates a request id when none is sent', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.ok(res.headers['x-request-id']);
  });

  it('500 hides internals from the response', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    assert.equal(res.statusCode, 500);
    assert.match(String(res.headers['content-type']), /^application\/problem\+json/);
    assert.ok(!res.body.includes('secret internal detail'));
    assert.ok(!res.body.includes('at '));
    assert.equal(res.json().detail, 'An unexpected error occurred');
  });
});
