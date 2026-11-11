import type { FastifyInstance } from 'fastify';
import { sendProblem } from './problem-details.js';

interface RoutePattern {
  method: string;
  matcher: RegExp;
}

function toMatcher(url: string): RegExp {
  const segments = url
    .split('/')
    .map((s) => (s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`^${segments.join('/')}$`);
}

/**
 * Answers unmatched requests: 405 with `Allow` when the path exists for other methods, 404
 * otherwise. Fastify has no built-in 405, so routes are collected through the `onRoute` hook.
 * Must be called before any route is registered.
 */
export function registerNotFoundHandler(app: FastifyInstance): void {
  const patterns: RoutePattern[] = [];

  app.addHook('onRoute', (route) => {
    const matcher = toMatcher(route.url);
    for (const method of [route.method].flat()) patterns.push({ method, matcher });
  });

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    const allowed = [...new Set(patterns.filter((p) => p.matcher.test(path)).map((p) => p.method))];
    if (allowed.length > 0) {
      reply.header('Allow', allowed.sort().join(', '));
      return sendProblem(
        request,
        reply,
        405,
        `Method ${request.method} is not allowed for ${path}`,
      );
    }
    return sendProblem(request, reply, 404, `Route ${request.method} ${path} not found`);
  });
}
