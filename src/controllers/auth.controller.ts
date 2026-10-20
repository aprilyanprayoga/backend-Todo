import type { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { getAuth } from '../middleware/auth';
import { sendSuccess } from '../utils/response';

export const authController = {
  async register(req: Request, res: Response) {
    sendSuccess(res, await authService.register(req.body), 201);
  },
  async login(req: Request, res: Response) {
    sendSuccess(res, await authService.login(req.body));
  },
  async logout(req: Request, res: Response) {
    await authService.logout(getAuth(req).accessToken);
    sendSuccess(res, { message: 'Logout berhasil' });
  },
  async refresh(req: Request, res: Response) {
    sendSuccess(res, await authService.refresh(req.body.refresh_token));
  },
  async me(req: Request, res: Response) {
    sendSuccess(res, { user: getAuth(req).user });
  },
  async forgotPassword(req: Request, res: Response) {
    await authService.forgotPassword(req.body.email);
    sendSuccess(res, { message: 'Jika email terdaftar, tautan reset password telah dikirim' });
  },
  async resetPassword(req: Request, res: Response) {
    await authService.resetPassword(getAuth(req).accessToken, req.body.password);
    sendSuccess(res, { message: 'Password berhasil diubah' });
  },
};
