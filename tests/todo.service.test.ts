import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBuilder } from './helpers';

const createUserClient = vi.fn();
vi.mock('../src/config/supabase', () => ({ createUserClient: (t: string) => createUserClient(t), createAnonClient: vi.fn() }));

import { todoService } from '../src/services/todo.service';
import { AppError } from '../src/utils/errors';

const UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = '11111111-1111-4111-8111-111111111111';

function setup(result: unknown) {
  const { builder, calls } = makeBuilder(result);
  createUserClient.mockReturnValue({ from: (table: string) => { calls.push(['from', [table]]); return builder; } });
  return calls;
}
const has = (calls: Array<[string, unknown[]]>, name: string, ...args: unknown[]) =>
  calls.some(([n, a]) => n === name && args.every((x, i) => a[i] === x));

beforeEach(() => createUserClient.mockReset());

describe('todoService: dua lapis isolasi', () => {
  it('memakai client berbasis token user (RLS aktif)', async () => {
    setup({ data: { id: ID }, error: null });
    await todoService.getById('token-a', UID, ID);
    expect(createUserClient).toHaveBeenCalledWith('token-a');
  });
  it.each([
    ['getById', () => todoService.getById('t', UID, ID), { data: { id: ID }, error: null }],
    ['update', () => todoService.update('t', UID, ID, { title: 'x' }), { data: { id: ID }, error: null }],
    ['remove', () => todoService.remove('t', UID, ID), { data: [{ id: ID }], error: null }],
  ])('%s selalu memfilter user_id dari token', async (_n, run, result) => {
    const calls = setup(result);
    await run();
    expect(has(calls, 'eq', 'user_id', UID)).toBe(true);
    expect(has(calls, 'eq', 'id', ID)).toBe(true);
  });
  it('list memfilter user_id', async () => {
    const calls = setup({ data: [], error: null, count: 0 });
    await todoService.list('t', UID, { sort_by: 'created_at', order: 'desc', page: 1, limit: 20 });
    expect(has(calls, 'eq', 'user_id', UID)).toBe(true);
  });
  it('create memaksa user_id = identitas token walau input menyelundupkan user_id lain', async () => {
    const calls = setup({ data: { id: ID }, error: null });
    await todoService.create('t', UID, { title: 'x', user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } as never);
    const insert = calls.find(([n]) => n === 'insert')![1][0] as { user_id: string };
    expect(insert.user_id).toBe(UID);
  });
});

describe('todoService: perilaku query', () => {
  it('list menerapkan search (wildcard di-escape), filter, sort NULLS LAST, dan range', async () => {
    const calls = setup({ data: [{ id: ID }], error: null, count: 45 });
    const res = await todoService.list('t', UID, {
      search: '50%_off',
      is_completed: false,
      priority: 'high',
      sort_by: 'due_date',
      order: 'asc',
      page: 3,
      limit: 20,
    });
    expect(has(calls, 'ilike', 'title', '%50\\%\\_off%')).toBe(true);
    expect(has(calls, 'eq', 'is_completed', false)).toBe(true);
    expect(has(calls, 'eq', 'priority', 'high')).toBe(true);
    expect(calls.find(([n, a]) => n === 'order' && a[0] === 'due_date')![1][1]).toEqual({ ascending: true, nullsFirst: false });
    expect(has(calls, 'range', 40, 59)).toBe(true);
    expect(res.meta).toEqual({ page: 3, limit: 20, total: 45, total_pages: 3 });
  });
  it('getById tidak ketemu -> AppError 404', async () => {
    setup({ data: null, error: null });
    await expect(todoService.getById('t', UID, ID)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
  it('update/remove tanpa baris terdampak -> 404', async () => {
    setup({ data: null, error: null });
    await expect(todoService.update('t', UID, ID, { title: 'x' })).rejects.toBeInstanceOf(AppError);
    setup({ data: [], error: null });
    await expect(todoService.remove('t', UID, ID)).rejects.toMatchObject({ status: 404 });
  });
  it('error DB: JWT expired -> 401, RLS violation -> 403, lainnya -> 500 tanpa bocor detail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ data: null, error: { code: 'PGRST303', message: 'JWT expired' } });
    await expect(todoService.getById('t', UID, ID)).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    setup({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(todoService.create('t', UID, { title: 'x' })).rejects.toMatchObject({ status: 403 });
    setup({ data: null, error: { code: 'XX000', message: 'rahasia internal' } });
    const err = await todoService.getById('t', UID, ID).catch((e) => e);
    expect(err.status).toBe(500);
    expect(err.message).not.toContain('rahasia');
  });
});
