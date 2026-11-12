import { Writable } from 'node:stream';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

export interface MovieJson {
  id: number;
  year: number;
  title: string;
  winner: boolean;
  producers: string[];
  studios: string[];
}

export interface LogRecord {
  level: number;
  msg: string;
  [key: string]: unknown;
}

export const WARN = 40;

/** A logger option that keeps every record in memory so tests can inspect warnings. */
export function captureLogs() {
  const records: LogRecord[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      for (const line of chunk.toString().split('\n')) {
        if (line) records.push(JSON.parse(line) as LogRecord);
      }
      done();
    },
  });
  return { logger: { level: 'info', stream }, records };
}

/** Walks `GET /movies` page by page until the end and returns every movie, in order. */
export async function fetchAllMovies(
  app: FastifyInstance,
  query = '',
  limit = 50,
): Promise<MovieJson[]> {
  const movies: MovieJson[] = [];
  let cursor: string | null = null;
  do {
    const cursorPart: string = cursor === null ? '' : `&cursor=${cursor}`;
    const res = await app.inject({
      method: 'GET',
      url: `/movies?limit=${limit}${query ? `&${query}` : ''}${cursorPart}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { data: MovieJson[]; page: { nextCursor: string | null } };
    movies.push(...body.data);
    cursor = body.page.nextCursor;
  } while (cursor !== null);
  return movies;
}

/** Builds an app for `csvPath`, runs `fn` and always closes the app. */
export async function withApp<T>(
  csvPath: string,
  fn: (app: FastifyInstance) => Promise<T>,
  logger?: Parameters<typeof buildApp>[0]['logger'],
): Promise<T> {
  const app = await buildApp({ csvPath, logger });
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}
