import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // di belakang load balancer platform hosting
  // CORP cross-origin: API ini memang dipanggil dari origin frontend lain (dibatasi oleh CORS di bawah).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(
    cors({
      origin(origin, callback) {
        // Request tanpa header Origin (curl, health check, server-to-server) diizinkan.
        if (!origin || env.allowedOrigins.includes(origin)) return callback(null, true);
        const err = new Error('Origin tidak diizinkan') as Error & { code: string };
        err.code = 'CORS_NOT_ALLOWED';
        return callback(err);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
