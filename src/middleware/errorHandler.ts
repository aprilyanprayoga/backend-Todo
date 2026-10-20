import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';

export const notFoundHandler: RequestHandler = (req, res) => {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.originalUrl} tidak ditemukan`);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Input tidak valid',
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  if (err instanceof AppError) {
    return sendError(res, err.status, err.code, err.message, err.details);
  }
  if (err?.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Body request bukan JSON yang valid');
  }
  if (err?.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Body request terlalu besar');
  }
  if (err?.code === 'CORS_NOT_ALLOWED') {
    return sendError(res, 403, 'CORS_NOT_ALLOWED', 'Origin tidak diizinkan');
  }
  console.error('[unhandled-error]', err);
  return sendError(
    res,
    500,
    'INTERNAL_ERROR',
    env.isProduction ? 'Terjadi kesalahan pada server' : String(err?.message ?? err),
  );
};
