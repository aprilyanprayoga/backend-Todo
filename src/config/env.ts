import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Konfigurasi environment tidak valid:\n${issues}`);
  process.exit(1);
}

const data = parsed.data;

export const env = {
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  supabaseUrl: data.SUPABASE_URL.replace(/\/+$/, ''),
  /** Daftar origin yang diizinkan CORS (tanpa trailing slash). */
  allowedOrigins: data.FRONTEND_URL.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
};
