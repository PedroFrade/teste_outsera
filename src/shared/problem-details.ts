import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, ValidationError, type FieldError } from './errors.js';

/** RFC 9457 Problem Details, plus `traceId` (the request id) and optional `errors`. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  traceId: string;
  errors?: FieldError[];
}

export function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  detail: string,
  errors?: FieldError[],
): FastifyReply {
  const body: ProblemDetails = {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    detail,
    instance: request.url,
    traceId: request.id,
    ...(errors && errors.length > 0 ? { errors } : {}),
  };
  return reply.status(status).type('application/problem+json').send(body);
}

function toFieldErrors(error: FastifyError): FieldError[] {
  return (error.validation ?? []).map((v) => {
    const missing = (v.params as { missingProperty?: string } | undefined)?.missingProperty;
    return {
      in: error.validationContext,
      field: v.instancePath.replace(/^\//, '') || missing || '',
      message: v.message ?? 'is invalid',
    };
  });
}

/** The single global error handler: every error leaves the API as Problem Details. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      const errors = error instanceof ValidationError ? error.errors : undefined;
      return sendProblem(request, reply, error.status, error.message, errors);
    }
    if (error.validation) {
      return sendProblem(request, reply, 400, 'Request validation failed', toFieldErrors(error));
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return sendProblem(request, reply, error.statusCode, error.message);
    }
    // The stack goes to the log only, correlated by traceId; the client gets a generic detail.
    request.log.error({ err: error, traceId: request.id }, 'Unhandled error');
    return sendProblem(request, reply, 500, 'An unexpected error occurred');
  });
}
