import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendError } from '../utils/response';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '../schemas/auth.schema';

export const authRoutes = Router();

// Pembatas percobaan untuk endpoint rawan brute-force / spam email.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => sendError(res, 429, 'RATE_LIMITED', 'Terlalu banyak percobaan, coba lagi nanti'),
});

authRoutes.post('/register', limiter, validate(registerSchema), asyncHandler(authController.register));
authRoutes.post('/login', limiter, validate(loginSchema), asyncHandler(authController.login));
authRoutes.post('/refresh', limiter, validate(refreshSchema), asyncHandler(authController.refresh));
authRoutes.post('/forgot-password', limiter, validate(forgotPasswordSchema), asyncHandler(authController.forgotPassword));
authRoutes.post('/logout', requireAuth, asyncHandler(authController.logout));
authRoutes.get('/me', requireAuth, asyncHandler(authController.me));
authRoutes.post('/reset-password', requireAuth, validate(resetPasswordSchema), asyncHandler(authController.resetPassword));
