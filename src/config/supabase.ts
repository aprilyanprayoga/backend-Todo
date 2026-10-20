import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

const baseAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * Client anonim untuk operasi Auth (signUp, signIn, getUser, dst).
 * SELALU buat instance baru per pemakaian: supabase-js menyimpan session di memori
 * setelah signIn, sehingga client yang dipakai bersama antar-request bisa membocorkan
 * session satu user ke request user lain.
 */
export function createAnonClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.SUPABASE_PUBLISHABLE_KEY, { auth: baseAuthOptions });
}

/**
 * Client yang bertindak SEBAGAI user pemilik access token.
 * Query ke database dieksekusi dengan role `authenticated` dan auth.uid() = user tsb,
 * sehingga Row Level Security aktif sebagai lapisan pertahanan terakhir.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: baseAuthOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
