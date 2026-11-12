import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import { openDatabase } from './db/connection.js';
import { applySchema } from './db/apply-schema.js';
import { importCsv } from './importer/import-csv.js';
import { healthRoutes } from './modules/health/routes.js';
import { createProducersRepository } from './modules/producers/repository.js';
import { producersRoutes } from './modules/producers/routes.js';
import { createProducersService, type ProducersService } from './modules/producers/service.js';
import { registerErrorHandler } from './shared/problem-details.js';
import { registerNotFoundHandler } from './shared/not-found.js';

export interface BuildAppOptions {
  csvPath: string;
  logger?: FastifyServerOptions['logger'];
}

/**
 * Builds the app with the CSV already imported. It never calls `listen`, so tests can
 * create an isolated instance per fixture and use `app.inject()`. Rejects if the import fails.
 */
export async function buildApp({
  csvPath,
  logger = false,
}: BuildAppOptions): Promise<FastifyInstance> {
  // randomUUID keeps request ids unique across restarts (a counter would repeat in the logs).
  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  const db = openDatabase();
  applySchema(db);
  // Runs after app.close() has drained requests: the database is the last thing to go.
  app.addHook('onClose', () => {
    db.close();
  });

  let producers: ProducersService;
  try {
    await importCsv(db, csvPath, app.log);
    producers = createProducersService(createProducersRepository(db));
  } catch (err) {
    app.log.fatal({ err }, 'Startup aborted: loading the CSV data failed');
    await app.close();
    throw err;
  }

  registerErrorHandler(app);
  registerNotFoundHandler(app);
  app.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-request-id', request.id);
    done(null, payload);
  });

  await app.register(helmet);
  app.register(healthRoutes);
  app.register(producersRoutes, { service: producers });

  return app;
}
