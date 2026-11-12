import type { FastifyInstance } from 'fastify';
import { getMovieSchema, listMoviesSchema } from './schemas.js';
import type { MoviesService } from './service.js';

interface ListQuery {
  winner?: boolean;
  year?: number;
  limit: number;
  cursor?: string;
}

export function moviesRoutes(app: FastifyInstance, { service }: { service: MoviesService }) {
  app.get<{ Querystring: ListQuery }>('/movies', { schema: listMoviesSchema }, (request) => {
    const { winner, year, limit, cursor } = request.query;
    return service.listMovies({ winner, year, limit, cursor });
  });

  app.get<{ Params: { id: number } }>('/movies/:id', { schema: getMovieSchema }, (request) =>
    service.getMovie(request.params.id),
  );
}
