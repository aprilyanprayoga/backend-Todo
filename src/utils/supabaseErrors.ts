import { AppError } from './errors';

interface PgLikeError {
  code?: string;
  error_code?: string;
  message?: string;
  status?: number;
  name?: string;
}

/** Terjemahkan error PostgREST/Postgres menjadi AppError. Detail internal hanya masuk log. */
export function fromDbError(error: PgLikeError): AppError {
  console.error('[db-error]', { code: error.code, message: error.message });
  switch (error.code) {
    case 'PGRST301':
    case 'PGRST303':
      return new AppError(401, 'TOKEN_EXPIRED', 'Token tidak valid atau sudah kedaluwarsa');
    case '42501':
      return new AppError(403, 'FORBIDDEN', 'Anda tidak berhak melakukan aksi ini');
    case '23514':
    case '22P02':
    case '22007':
    case '22008':
      return new AppError(400, 'INVALID_DATA', 'Data tidak memenuhi aturan database');
    default:
      return new AppError(500, 'DATABASE_ERROR', 'Terjadi kesalahan pada database');
  }
}

const AUTH_CODE_MAP: Record<string, [number, string]> = {
  user_already_exists: [409, 'EMAIL_ALREADY_REGISTERED'],
  email_exists: [409, 'EMAIL_ALREADY_REGISTERED'],
  weak_password: [422, 'WEAK_PASSWORD'],
  same_password: [422, 'SAME_PASSWORD'],
  invalid_credentials: [401, 'INVALID_CREDENTIALS'],
  email_not_confirmed: [403, 'EMAIL_NOT_CONFIRMED'],
  user_banned: [403, 'USER_BANNED'],
  over_request_rate_limit: [429, 'RATE_LIMITED'],
  over_email_send_rate_limit: [429, 'RATE_LIMITED'],
  refresh_token_not_found: [401, 'INVALID_REFRESH_TOKEN'],
  refresh_token_already_used: [401, 'INVALID_REFRESH_TOKEN'],
  session_expired: [401, 'SESSION_EXPIRED'],
  session_not_found: [401, 'SESSION_EXPIRED'],
  bad_jwt: [401, 'INVALID_TOKEN'],
  signup_disabled: [403, 'SIGNUP_DISABLED'],
  validation_failed: [400, 'VALIDATION_ERROR'],
};

/** Terjemahkan error Supabase Auth (AuthError / respons GoTrue) menjadi AppError. */
export function fromAuthError(error: PgLikeError): AppError {
  const code = error.code ?? error.error_code ?? '';
  if (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500 || error.status === 0) {
    console.error('[auth-upstream-error]', { code, status: error.status, message: error.message });
    return new AppError(503, 'AUTH_SERVICE_UNAVAILABLE', 'Layanan autentikasi sedang tidak tersedia');
  }
  const mapped = AUTH_CODE_MAP[code];
  if (mapped) return new AppError(mapped[0], mapped[1], error.message ?? 'Kesalahan autentikasi');
  const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 400;
  return new AppError(status, 'AUTH_ERROR', error.message ?? 'Kesalahan autentikasi');
}
