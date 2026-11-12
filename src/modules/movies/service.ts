import { NotFoundError } from '../../shared/errors.js';
import { decodeCursor, encodeCursor } from '../../shared/pagination.js';
import type { Movie, MovieFilters, MoviesRepository } from './repository.js';

export interface ListMoviesParams extends MovieFilters {
  limit: number;
  cursor?: string;
}

export interface MoviesPage {
  data: Movie[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
}

export function createMoviesService(repository: MoviesRepository) {
  return {
    listMovies({ limit, cursor, ...filters }: ListMoviesParams): MoviesPage {
      const afterId = cursor === undefined ? 0 : decodeCursor(cursor);
      // One extra row tells whether there is a next page without a COUNT query.
      const rows = repository.findPage(filters, afterId, limit + 1);
      const hasMore = rows.length > limit;
      const data = hasMore ? rows.slice(0, limit) : rows;
      const last = data.at(-1);
      return {
        data,
        page: { limit, nextCursor: hasMore && last ? encodeCursor(last.id) : null, hasMore },
      };
    },

    getMovie(id: number): Movie {
      const movie = repository.findById(id);
      if (!movie) throw new NotFoundError(`Movie ${id} not found`);
      return movie;
    },
  };
}

export type MoviesService = ReturnType<typeof createMoviesService>;
