import { DEFAULT_LIMIT, MAX_LIMIT } from '../../shared/pagination.js';

const movieSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    year: { type: 'integer' },
    title: { type: 'string' },
    winner: { type: 'boolean' },
    producers: { type: 'array', items: { type: 'string' } },
    studios: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'year', 'title', 'winner', 'producers', 'studios'],
} as const;

export const listMoviesSchema = {
  querystring: {
    type: 'object',
    properties: {
      winner: { type: 'boolean' },
      year: { type: 'integer' },
      limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
      cursor: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: { type: 'array', items: movieSchema },
        page: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
            nextCursor: { type: ['string', 'null'] },
            hasMore: { type: 'boolean' },
          },
          required: ['limit', 'nextCursor', 'hasMore'],
        },
      },
      required: ['data', 'page'],
    },
  },
} as const;

export const getMovieSchema = {
  params: {
    type: 'object',
    properties: { id: { type: 'integer', minimum: 1 } },
    required: ['id'],
  },
  response: { 200: movieSchema },
} as const;
