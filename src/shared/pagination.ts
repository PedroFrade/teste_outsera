import { ValidationError } from './errors.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

/** Opaque cursor: base64url of `{"id": <last id of the previous page>}` (keyset pagination). */
export function encodeCursor(id: number): string {
  return Buffer.from(JSON.stringify({ id })).toString('base64url');
}

/** Returns the id after which the next page starts, or throws a 400 for an invalid cursor. */
export function decodeCursor(cursor: string): number {
  try {
    const { id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      id?: unknown;
    };
    // Re-encoding rejects anything that merely decodes (extra keys, padding, stray characters).
    if (Number.isSafeInteger(id) && (id as number) >= 0 && encodeCursor(id as number) === cursor) {
      return id as number;
    }
  } catch {
    // Not valid JSON: handled below.
  }
  throw new ValidationError('Invalid cursor', [
    { in: 'querystring', field: 'cursor', message: 'is not a valid cursor' },
  ]);
}
