import { Router } from 'express';
import { sendSuccess } from '../utils/response';

export const healthRoutes = Router();

healthRoutes.get('/', (_req, res) => {
  sendSuccess(res, { status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});
