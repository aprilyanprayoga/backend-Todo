import { createAnonClient } from '../config/supabase';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { fromAuthError } from '../utils/supabaseErrors';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema';
import type { PublicUser } from '../types';

function toPublicUser(u: {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): PublicUser {
  return {
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    user_metadata: u.user_metadata ?? {},
  };
}

function toSession(s: {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
}) {
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: s.token_type,
    expires_in: s.expires_in,
    expires_at: s.expires_at ?? null,
  };
}

/** Panggilan langsung ke GoTrue REST untuk operasi yang butuh token user tanpa menyimpan session. */
async function gotrue(path: string, method: 'POST' | 'PUT', accessToken: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${env.supabaseUrl}/auth/v1${path}`, {
      method,
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    console.error('[gotrue-fetch-failed]', err);
    throw new AppError(503, 'AUTH_SERVICE_UNAVAILABLE', 'Layanan autentikasi sedang tidak tersedia');
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      code?: number | string;
      error_code?: string;
      msg?: string;
      message?: string;
    };
    throw fromAuthError({
      status: res.status,
      code: json.error_code ?? (typeof json.code === 'string' ? json.code : undefined),
      message: json.msg ?? json.message,
    });
  }
  return res;
}

export const authService = {
  async register({ email, password, display_name }: RegisterInput) {
    const { data, error } = await createAnonClient().auth.signUp({
      email,
      password,
      options: {
        data: display_name ? { display_name } : undefined,
        emailRedirectTo: env.allowedOrigins[0],
      },
    });
    if (error) throw fromAuthError(error);
    if (!data.user) throw new AppError(500, 'REGISTER_FAILED', 'Registrasi gagal');
    return {
      user: toPublicUser(data.user),
      // null jika "Confirm email" aktif di Supabase: user harus verifikasi email dulu.
      session: data.session ? toSession(data.session) : null,
      requires_email_confirmation: !data.session,
    };
  },

  async login({ email, password }: LoginInput) {
    const { data, error } = await createAnonClient().auth.signInWithPassword({ email, password });
    if (error) throw fromAuthError(error);
    return { user: toPublicUser(data.user), session: toSession(data.session) };
  },

  async logout(accessToken: string) {
    // scope=local: hanya mengakhiri session perangkat ini.
    await gotrue('/logout?scope=local', 'POST', accessToken);
  },

  async refresh(refreshToken: string) {
    const { data, error } = await createAnonClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) {
      if (error && (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500)) {
        throw fromAuthError(error);
      }
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token tidak valid, silakan login ulang');
    }
    return { user: toPublicUser(data.user), session: toSession(data.session) };
  },

  async forgotPassword(email: string) {
    const { error } = await createAnonClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${env.allowedOrigins[0]}/reset-password`,
    });
    // Respons selalu sama agar tidak membocorkan email mana yang terdaftar.
    if (error) {
      const mapped = fromAuthError(error);
      if (mapped.status === 429 || mapped.status === 503) throw mapped;
      console.warn('[forgot-password]', error.code ?? error.message);
    }
  },

  /** Dipanggil dengan access token dari sesi recovery (link email reset password). */
  async resetPassword(accessToken: string, password: string) {
    await gotrue('/user', 'PUT', accessToken, { password });
  },
};
