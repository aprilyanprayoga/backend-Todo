import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

/** Validasi + normalisasi input; hasil parse menggantikan req[source]. Error ditangani errorHandler. */
export const validate =
  (schema: ZodTypeAny, source: Source = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) return next(result.error);
    (req as unknown as Record<Source, unknown>)[source] = result.data;
    next();
  };
