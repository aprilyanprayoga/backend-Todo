export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthorized = (code = 'UNAUTHORIZED', message = 'Autentikasi diperlukan') =>
  new AppError(401, code, message);
export const notFound = (message = 'Data tidak ditemukan') => new AppError(404, 'NOT_FOUND', message);
