import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Format email tidak valid').max(254);
const password = z.string().min(8, 'Password minimal 8 karakter').max(72, 'Password maksimal 72 karakter');

export const registerSchema = z.object({
  email,
  password,
  display_name: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password wajib diisi').max(72),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token wajib diisi'),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
