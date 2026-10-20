import type { RequestHandler } from 'express';
import { createAnonClient } from '../config/supabase';
import { AppError, unauthorized } from '../utils/errors';
import type { AuthContext, PublicUser } from '../types';

/**
 * Memverifikasi access token Supabase ke server Auth (auth.getUser) pada SETIAP request.
 * Identitas user HANYA berasal dari token terverifikasi, tidak pernah dari body/query/params.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const match = req.header('authorization')?.match(/^Bearer\s+(\S+)$/i);
    if (!match?.[1]) {
      throw unauthorized('UNAUTHORIZED', 'Header Authorization: Bearer <access_token> diperlukan');
    }
    const accessToken = match[1];

    const { data, error } = await createAnonClient().auth.getUser(accessToken);

    if (error || !data.user) {
      if (error && (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500)) {
        throw new AppError(503, 'AUTH_SERVICE_UNAVAILABLE', 'Layanan autentikasi sedang tidak tersedia');
      }
      const expired = /expired/i.test(error?.message ?? '');
      throw unauthorized(
        expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        expired ? 'Access token kedaluwarsa, silakan refresh session' : 'Access token tidak valid',
      );
    }

    const u = data.user;
    const user: PublicUser = {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      user_metadata: u.user_metadata ?? {},
    };
    req.auth = { userId: u.id, accessToken, user };
    next();
  } catch (err) {
    next(err);
  }
};

/** Ambil auth context; melempar 401 jika middleware requireAuth belum dijalankan. */
export function getAuth(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
