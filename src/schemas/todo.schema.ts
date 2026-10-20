import { z } from 'zod';
import { PRIORITIES } from '../types';

const title = z.string().trim().min(1, 'Title wajib diisi').max(200, 'Title maksimal 200 karakter');
const description = z.string().max(5000, 'Description maksimal 5000 karakter').nullable();
const priority = z.enum(PRIORITIES);
const dueDate = z
  .string()
  .datetime({ offset: true, message: 'due_date harus berformat ISO 8601, contoh 2026-12-31T17:00:00Z' })
  .nullable();

/** Properti tak dikenal (termasuk user_id) otomatis dibuang oleh zod. */
export const createTodoSchema = z.object({
  title,
  description: description.optional(),
  is_completed: z.boolean().optional(),
  priority: priority.optional(),
  due_date: dueDate.optional(),
});

export const updateTodoSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    is_completed: z.boolean().optional(),
    priority: priority.optional(),
    due_date: dueDate.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Minimal satu field harus diisi',
  });

export const todoIdParamSchema = z.object({ id: z.string().uuid('id harus berupa UUID') });

export const SORT_FIELDS = ['created_at', 'updated_at', 'due_date', 'priority', 'title'] as const;

export const listTodosQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  is_completed: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  priority: priority.optional(),
  sort_by: z.enum(SORT_FIELDS).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type ListTodosQuery = z.infer<typeof listTodosQuerySchema>;
