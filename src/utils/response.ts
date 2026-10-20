import type { Response } from 'express';
import type { PaginationMeta } from '../types';

export function sendSuccess<T>(res: Response, data: T, status = 200, meta?: PaginationMeta) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function sendError(res: Response, status: number, code: string, message: string, details?: unknown) {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}
