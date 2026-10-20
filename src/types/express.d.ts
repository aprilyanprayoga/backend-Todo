import type { AuthContext } from './index';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Diisi oleh middleware requireAuth setelah token diverifikasi ke Supabase. */
      auth?: AuthContext;
    }
  }
}

export {};
