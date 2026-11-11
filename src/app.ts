import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import { openDatabase } from './db/connection.js';
import { applySchema } from './db/apply-schema.js';
import { healthRoutes } from './modules/health/routes.js';
import { registerErrorHandler } from './shared/problem-details.js';
import { registerNotFoundHandler } from './shared/not-found.js';

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
}

/**
 * Builds the app with the database ready. It never calls `listen`, so tests can
 * create an isolated instance per fixture and use `app.inject()`.
 */
export async function buildApp({ logger = false }: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger, requestIdHeader: 'x-request-id' });

  const db = openDatabase();
  applySchema(db);
  // Runs after app.close() has drained requests: the database is the last thing to go.
  app.addHook('onClose', () => {
    db.close();
  });

  registerErrorHandler(app);
  registerNotFoundHandler(app);
  app.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-request-id', request.id);
    done(null, payload);
  });

  await app.register(helmet);
  app.register(healthRoutes);

  return app;
}
