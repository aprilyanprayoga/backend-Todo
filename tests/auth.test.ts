import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserMock } from './helpers';

vi.mock('../src/config/supabase', () => ({
  createAnonClient: () => ({ auth: { getUser: getUserMock } }),
  createUserClient: vi.fn(),
}));
vi.mock('../src/services/auth.service', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

import { createApp } from '../src/app';
import { authService } from '../src/services/auth.service';
import { AppError } from '../src/utils/errors';

const app = createApp();

beforeEach(() => vi.clearAllMocks());

describe('health & routing', () => {
  it('GET /api/health -> 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });
  it('route tak dikenal -> 404 format error konsisten', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'ROUTE_NOT_FOUND' } });
  });
  it('JSON rusak -> 400 INVALID_JSON', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('CORS', () => {
  it('origin yang diizinkan mendapat header CORS', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
  it('origin tak dikenal ditolak 403', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CORS_NOT_ALLOWED');
  });
});

describe('GET /api/auth/me', () => {
  it('tanpa header -> 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
  it('token tidak valid -> 401 INVALID_TOKEN', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer sampah');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
  it('token kedaluwarsa -> 401 TOKEN_EXPIRED', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer expired-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });
  it('token valid -> 200 dengan data user', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-a');
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.com' });
  });
});

describe('POST /api/auth/register', () => {
  it('email tidak valid -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bukan-email', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('password < 8 karakter -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.co', password: 'short' });
    expect(res.status).toBe(400);
  });
  it('sukses -> 201 dan email dinormalisasi', async () => {
    vi.mocked(authService.register).mockResolvedValue({ user: { id: 'x' }, session: null, requires_email_confirmation: true } as never);
    const res = await request(app).post('/api/auth/register').send({ email: '  User@Example.COM ', password: 'password123' });
    expect(res.status).toBe(201);
    expect(authService.register).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password123' });
  });
  it('email sudah terdaftar -> 409', async () => {
    vi.mocked(authService.register).mockRejectedValue(new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'sudah ada'));
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.co', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });
});

describe('POST /api/auth/login', () => {
  it('kredensial salah -> 401 INVALID_CREDENTIALS', async () => {
    vi.mocked(authService.login).mockRejectedValue(new AppError(401, 'INVALID_CREDENTIALS', 'salah'));
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'salahsalah' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
  it('sukses -> 200', async () => {
    vi.mocked(authService.login).mockResolvedValue({ user: { id: 'x' }, session: { access_token: 't' } } as never);
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('logout, refresh, forgot/reset password', () => {
  it('logout tanpa token -> 401', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
  it('logout dengan token -> service dipanggil dengan token tsb', async () => {
    const res = await request(app).post('/api/auth/logout').set('Authorization', 'Bearer token-a');
    expect(res.status).toBe(200);
    expect(authService.logout).toHaveBeenCalledWith('token-a');
  });
  it('refresh tanpa refresh_token -> 400', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });
  it('refresh token invalid -> 401', async () => {
    vi.mocked(authService.refresh).mockRejectedValue(new AppError(401, 'INVALID_REFRESH_TOKEN', 'x'));
    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'abc' });
    expect(res.status).toBe(401);
  });
  it('forgot-password selalu 200 dengan pesan generik', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'siapa@saja.com' });
    expect(res.status).toBe(200);
  });
  it('reset-password butuh token & password valid', async () => {
    expect((await request(app).post('/api/auth/reset-password').send({ password: 'passwordbaru1' })).status).toBe(401);
    const bad = await request(app).post('/api/auth/reset-password').set('Authorization', 'Bearer token-a').send({ password: '1' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/auth/reset-password').set('Authorization', 'Bearer token-a').send({ password: 'passwordbaru1' });
    expect(ok.status).toBe(200);
    expect(authService.resetPassword).toHaveBeenCalledWith('token-a', 'passwordbaru1');
  });
});
