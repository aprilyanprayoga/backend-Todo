import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserMock, USER_A, USER_B } from './helpers';

vi.mock('../src/config/supabase', () => ({
  createAnonClient: () => ({ auth: { getUser: getUserMock } }),
  createUserClient: vi.fn(),
}));
vi.mock('../src/services/todo.service', () => ({
  todoService: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

import { createApp } from '../src/app';
import { todoService } from '../src/services/todo.service';
import { AppError } from '../src/utils/errors';

const app = createApp();
const ID = '11111111-1111-4111-8111-111111111111';
const authA = { Authorization: 'Bearer token-a' };
const authB = { Authorization: 'Bearer token-b' };

beforeEach(() => vi.clearAllMocks());

describe('semua endpoint todo wajib autentikasi', () => {
  const cases: Array<[string, string]> = [
    ['post', '/api/todos'],
    ['get', '/api/todos'],
    ['get', `/api/todos/${ID}`],
    ['patch', `/api/todos/${ID}`],
    ['delete', `/api/todos/${ID}`],
  ];
  it.each(cases)('%s %s tanpa token -> 401', async (method, url) => {
    const res = await (request(app) as any)[method](url).send({ title: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
  it('token palsu -> 401 dan service tidak pernah dipanggil', async () => {
    const res = await request(app).get('/api/todos').set('Authorization', 'Bearer palsu');
    expect(res.status).toBe(401);
    expect(todoService.list).not.toHaveBeenCalled();
  });
});

describe('isolasi identitas (user_id hanya dari token)', () => {
  it('POST mengabaikan user_id dari body', async () => {
    vi.mocked(todoService.create).mockResolvedValue({ id: ID } as never);
    const res = await request(app)
      .post('/api/todos')
      .set(authA)
      .send({ title: 'Beli susu', user_id: USER_B.id });
    expect(res.status).toBe(201);
    const [token, userId, input] = vi.mocked(todoService.create).mock.calls[0]!;
    expect(token).toBe('token-a');
    expect(userId).toBe(USER_A.id);
    expect(input).not.toHaveProperty('user_id');
  });
  it('PATCH mengabaikan user_id dari body', async () => {
    vi.mocked(todoService.update).mockResolvedValue({ id: ID } as never);
    await request(app).patch(`/api/todos/${ID}`).set(authA).send({ title: 'Baru', user_id: USER_B.id });
    const [, userId, , patch] = vi.mocked(todoService.update).mock.calls[0]!;
    expect(userId).toBe(USER_A.id);
    expect(patch).toEqual({ title: 'Baru' });
  });
  it('user berbeda -> identitas service berbeda sesuai token masing-masing', async () => {
    vi.mocked(todoService.getById).mockResolvedValue({ id: ID } as never);
    await request(app).get(`/api/todos/${ID}`).set(authA);
    await request(app).get(`/api/todos/${ID}`).set(authB);
    expect(vi.mocked(todoService.getById).mock.calls.map((c) => c[1])).toEqual([USER_A.id, USER_B.id]);
  });
  it('akses todo milik orang lain -> 404 (bukan 403, tidak membocorkan keberadaan)', async () => {
    vi.mocked(todoService.getById).mockRejectedValue(new AppError(404, 'NOT_FOUND', 'Todo tidak ditemukan'));
    const res = await request(app).get(`/api/todos/${ID}`).set(authB);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('validasi input', () => {
  it('title kosong -> 400 dengan detail field', async () => {
    const res = await request(app).post('/api/todos').set(authA).send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('title');
  });
  it('priority di luar enum -> 400', async () => {
    const res = await request(app).post('/api/todos').set(authA).send({ title: 'x', priority: 'urgent' });
    expect(res.status).toBe(400);
  });
  it('due_date bukan ISO -> 400', async () => {
    const res = await request(app).post('/api/todos').set(authA).send({ title: 'x', due_date: 'besok' });
    expect(res.status).toBe(400);
  });
  it('id bukan UUID -> 400', async () => {
    const res = await request(app).get('/api/todos/123').set(authA);
    expect(res.status).toBe(400);
  });
  it('PATCH body kosong -> 400', async () => {
    const res = await request(app).patch(`/api/todos/${ID}`).set(authA).send({});
    expect(res.status).toBe(400);
  });
  it('query tidak valid (limit 1000, sort_by sembarang) -> 400', async () => {
    expect((await request(app).get('/api/todos?limit=1000').set(authA)).status).toBe(400);
    expect((await request(app).get('/api/todos?sort_by=user_id').set(authA)).status).toBe(400);
  });
});

describe('CRUD', () => {
  it('POST sukses -> 201 dan nilai default tidak dipaksa di controller', async () => {
    vi.mocked(todoService.create).mockResolvedValue({ id: ID, title: 'Tugas' } as never);
    const res = await request(app).post('/api/todos').set(authA).send({
      title: '  Tugas  ',
      priority: 'high',
      due_date: '2026-12-31T17:00:00Z',
      description: null,
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { id: ID, title: 'Tugas' } });
    expect(vi.mocked(todoService.create).mock.calls[0]![2]).toEqual({
      title: 'Tugas',
      priority: 'high',
      due_date: '2026-12-31T17:00:00Z',
      description: null,
    });
  });
  it('GET list meneruskan query terparse + default, respons memuat meta', async () => {
    vi.mocked(todoService.list).mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 20, total: 0, total_pages: 0 },
    } as never);
    const res = await request(app)
      .get('/api/todos?search=susu&is_completed=false&priority=high&sort_by=due_date&order=asc')
      .set(authA);
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 0, total_pages: 0 });
    expect(vi.mocked(todoService.list).mock.calls[0]![2]).toEqual({
      search: 'susu',
      is_completed: false,
      priority: 'high',
      sort_by: 'due_date',
      order: 'asc',
      page: 1,
      limit: 20,
    });
  });
  it('PATCH boleh mengosongkan description & due_date dengan null', async () => {
    vi.mocked(todoService.update).mockResolvedValue({ id: ID } as never);
    const res = await request(app).patch(`/api/todos/${ID}`).set(authA).send({ description: null, due_date: null, is_completed: true });
    expect(res.status).toBe(200);
    expect(vi.mocked(todoService.update).mock.calls[0]![3]).toEqual({ description: null, due_date: null, is_completed: true });
  });
  it('DELETE sukses -> 200 {id}', async () => {
    vi.mocked(todoService.remove).mockResolvedValue({ id: ID });
    const res = await request(app).delete(`/api/todos/${ID}`).set(authA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: ID } });
  });
  it('error tak terduga -> 500 dengan format error konsisten', async () => {
    vi.mocked(todoService.getById).mockRejectedValue(new Error('boom'));
    const res = await request(app).get(`/api/todos/${ID}`).set(authA);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
