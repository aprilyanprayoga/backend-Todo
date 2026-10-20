import { createUserClient } from '../config/supabase';
import { notFound } from '../utils/errors';
import { fromDbError } from '../utils/supabaseErrors';
import type { PaginationMeta, Todo } from '../types';
import type { CreateTodoInput, ListTodosQuery, UpdateTodoInput } from '../schemas/todo.schema';

const COLUMNS = 'id,user_id,title,description,is_completed,priority,due_date,created_at,updated_at';

/** Escape karakter wildcard ILIKE agar input user diperlakukan sebagai teks biasa. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Setiap method memakai client berbasis token user (RLS aktif) DAN filter eksplisit user_id
 * dari token terverifikasi: dua lapis isolasi.
 */
export const todoService = {
  async list(accessToken: string, userId: string, q: ListTodosQuery) {
    let query = createUserClient(accessToken)
      .from('todos')
      .select(COLUMNS, { count: 'exact' })
      .eq('user_id', userId);

    if (q.search) query = query.ilike('title', `%${escapeLike(q.search)}%`);
    if (q.is_completed !== undefined) query = query.eq('is_completed', q.is_completed);
    if (q.priority) query = query.eq('priority', q.priority);

    const from = (q.page - 1) * q.limit;
    const { data, error, count } = await query
      .order(q.sort_by, { ascending: q.order === 'asc', nullsFirst: false })
      .order('id', { ascending: true }) // tie-breaker agar pagination stabil
      .range(from, from + q.limit - 1);

    if (error) throw fromDbError(error);
    const total = count ?? 0;
    const meta: PaginationMeta = {
      page: q.page,
      limit: q.limit,
      total,
      total_pages: Math.ceil(total / q.limit),
    };
    return { items: (data ?? []) as Todo[], meta };
  },

  async getById(accessToken: string, userId: string, id: string) {
    const { data, error } = await createUserClient(accessToken)
      .from('todos')
      .select(COLUMNS)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw notFound('Todo tidak ditemukan');
    return data as Todo;
  },

  async create(accessToken: string, userId: string, input: CreateTodoInput) {
    const { data, error } = await createUserClient(accessToken)
      .from('todos')
      .insert({ ...input, user_id: userId })
      .select(COLUMNS)
      .single();
    if (error) throw fromDbError(error);
    return data as Todo;
  },

  async update(accessToken: string, userId: string, id: string, patch: UpdateTodoInput) {
    const { data, error } = await createUserClient(accessToken)
      .from('todos')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw fromDbError(error);
    if (!data) throw notFound('Todo tidak ditemukan');
    return data as Todo;
  },

  async remove(accessToken: string, userId: string, id: string) {
    const { data, error } = await createUserClient(accessToken)
      .from('todos')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw fromDbError(error);
    if (!data || data.length === 0) throw notFound('Todo tidak ditemukan');
    return { id };
  },
};
