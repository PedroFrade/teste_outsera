import type { FastifyInstance } from 'fastify';
import { awardIntervalsSchema } from './schemas.js';
import type { ProducersService } from './service.js';

export function producersRoutes(app: FastifyInstance, { service }: { service: ProducersService }) {
  app.get('/producers/award-intervals', { schema: awardIntervalsSchema }, () =>
    service.getAwardIntervals(),
  );
}
