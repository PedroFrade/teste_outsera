import type { FastifyInstance } from 'fastify';
import { ValidationError } from './errors.js';

interface QuerystringSchema {
  properties?: Record<string, unknown>;
}

/**
 * Rejects (400) any query parameter the route's `querystring` schema does not declare, instead of
 * silently ignoring a typo like `?cursos=` and returning the first page. A route with no
 * querystring schema accepts no parameters. Must be called before any route is registered.
 *
 * It is a hook, not `additionalProperties: false` in each schema: Fastify's Ajv strips extra
 * properties by default (`removeAdditional`), and routes without a querystring schema would be
 * left uncovered.
 */
export function registerUnknownQueryGuard(app: FastifyInstance): void {
  app.addHook('preValidation', (request, _reply, done) => {
    // Unmatched routes go to the 404/405 handler, which must not turn into a 400.
    if (request.is404) return done();

    const schema = request.routeOptions.schema?.querystring as QuerystringSchema | undefined;
    const known = new Set(Object.keys(schema?.properties ?? {}));
    const unknown = Object.keys(request.query as Record<string, unknown>).filter(
      (name) => !known.has(name),
    );
    if (unknown.length === 0) return done();

    done(
      new ValidationError(
        `Unknown query parameter: ${unknown.join(', ')}`,
        unknown.map((field) => ({ in: 'querystring', field, message: 'is not a known parameter' })),
      ),
    );
  });
}
