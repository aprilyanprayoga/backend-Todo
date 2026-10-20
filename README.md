# To-Do List Backend

REST API multi-user: Node.js + Express + TypeScript, autentikasi dan database di Supabase (Auth + PostgreSQL + RLS). Frontend (React + Vite) terpisah dan tidak termasuk di repo ini. Kontrak API untuk frontend ada di [`docs/API.md`](docs/API.md).

## 1. Arsitektur dan alur autentikasi

```
React (Vercel) ──HTTPS + Bearer token──▶ Express API ──token user──▶ Supabase PostgREST (RLS)
                                              └────────────────────▶ Supabase Auth (verifikasi token)
```

1. Frontend memanggil `POST /api/auth/login` → backend meneruskan ke Supabase Auth → frontend menerima `access_token` + `refresh_token`.
2. Setiap request ke `/api/todos*` membawa `Authorization: Bearer <access_token>`.
3. Middleware `requireAuth` memverifikasi token ke Supabase (`auth.getUser`) dan mengisi `req.auth.userId`. Identitas **hanya** dari sini.
4. Service membuat client Supabase **atas nama user itu** (token user, bukan service role). Database menjalankan query sebagai role `authenticated` sehingga policy RLS berbasis `auth.uid()` aktif.
5. Isolasi dua lapis: (a) filter eksplisit `user_id` dari token di setiap query, (b) RLS di database. Jika salah satu bocor, yang lain tetap menahan.

Keputusan desain:
- **Service role key tidak dipakai sama sekali.** Karena itu `.env` hanya berisi `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` (aman by design, dibatasi RLS). Jika suatu hari Anda menambahkan fitur admin yang memakai `SUPABASE_SERVICE_ROLE_KEY`: key itu rahasia, melewati RLS, hanya boleh di environment server, tidak boleh ke frontend maupun GitHub.
- Todo milik user lain menghasilkan **404**, bukan 403.
- `priority` adalah enum Postgres berurutan (low < medium < high) agar pengurutan benar.
- `due_date` bertipe `timestamptz` (ISO 8601).
- Client Supabase dibuat per-request; client bersama bisa membocorkan session antar-user.

## 2. Struktur

```
src/
  config/       env (divalidasi zod), pembuat client Supabase
  controllers/  adaptor HTTP tipis
  middleware/   auth, validate, errorHandler
  routes/       health, auth, todos
  schemas/      skema zod (input)
  services/     logika bisnis + akses Supabase
  types/  utils/
  app.ts  server.ts
supabase/migrations/   SQL tabel, index, trigger, RLS
supabase/tests/        tes RLS (SQL)
tests/                 vitest + supertest
scripts/               smoke test e2e (butuh Supabase nyata)
Dockerfile
```

## 3. Setup lokal

Prasyarat: Node.js 20+ dan project Supabase.

1. `npm install`
2. `cp .env.example .env` lalu isi `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` (Supabase Dashboard → Project Settings → API).
3. Jalankan migration: tempel isi `supabase/migrations/20260101000000_create_todos.sql` ke **SQL Editor** Supabase, atau `supabase db push` dengan Supabase CLI.
4. Konfigurasi Supabase Auth (Authentication → URL Configuration): tambahkan `http://localhost:5173/reset-password` dan URL produksi Anda ke **Redirect URLs**, kalau tidak, link reset password ditolak. Untuk development, Anda boleh mematikan "Confirm email" agar register langsung memberi session.
5. `npm run dev` → server di `http://localhost:3000`, cek `GET /api/health`.

## 4. Pengujian

| Perintah | Isi | Butuh Supabase? |
|---|---|---|
| `npm run typecheck` | Cek tipe | Tidak |
| `npm test` | 52 tes: auth, validasi, CRUD, query builder, isolasi identitas | Tidak (Supabase di-mock) |
| `DATABASE_URL=… npm run test:rls` | Tes RLS asli di Postgres: user B tidak bisa SELECT/UPDATE/DELETE/memindahkan data A, anon ditolak, constraint, trigger | Ya (koneksi Postgres; aman, di-ROLLBACK) |
| `BASE_URL=… npm run test:e2e` | Dua akun nyata mencoba saling mengakses todo lewat API | Ya, server jalan + project dev |

Peringatan jujur tentang cakupan: `npm test` memakai mock Supabase, jadi **tidak** membuktikan perilaku Supabase Auth/PostgREST sesungguhnya. Bukti isolasi di level database datang dari `test:rls`, dan bukti end-to-end dari `test:e2e`. Jalankan keduanya terhadap project Supabase milik Anda sebelum produksi.

## 5. Environment variables

| Variabel | Wajib | Keterangan |
|---|---|---|
| `PORT` | Tidak (3000) | Platform hosting biasanya menyetelnya |
| `SUPABASE_URL` | Ya | URL project |
| `SUPABASE_PUBLISHABLE_KEY` | Ya | Publishable/anon key |
| `FRONTEND_URL` | Ya | Origin CORS, pisahkan koma: `http://localhost:5173,https://app.vercel.app` |

Jangan commit `.env` (sudah di `.gitignore`).

## 6. Build dan production

```bash
npm run build   # TypeScript -> dist/
npm start       # node dist/server.js, listen 0.0.0.0:$PORT
```

## 7. Deployment ke Aiven

Aiven terutama menyediakan **layanan data terkelola** (PostgreSQL, Kafka, dll.), bukan hosting aplikasi umum. Pada saat saya mengecek dokumentasinya, tersedia **Aiven Runtime / Aiven Apps** untuk menjalankan aplikasi **container** langsung dari Git, tetapi halaman dokumentasinya menyebut statusnya *limited availability* (perlu minta akses ke Aiven), sedangkan halaman produknya menyebut General Availability dan rencana paket berbayar untuk produksi. Status ini bisa berubah, jadi pastikan akses akun Anda ke fitur **Runtime** di Aiven Console sebelum merencanakan produksi di sana.

Jika Runtime tersedia di akun Anda:
1. Push repo ke GitHub (`Dockerfile` ada di root folder ini; jika repo Anda monorepo, arahkan build context ke `server/`).
2. Di Aiven Console buka project → **Runtime** → buat aplikasi dari repo/branch GitHub.
3. Isi environment variables (tab Variables / Secrets): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRONTEND_URL` (domain Vercel Anda), `NODE_ENV=production`. Port: pastikan container mengekspos port yang sama dengan `PORT` (default 3000).
4. Deploy, lalu cek `GET https://<domain-app>/api/health`.

Jika Runtime tidak tersedia: **jangan** membuat database Aiven (database Anda di Supabase). Pakai `Dockerfile` yang sama di platform container/Node lain seperti Render, Railway, Fly.io, atau Koyeb, dengan build `npm ci && npm run build` dan start `npm start`.

Setelah backend punya URL publik: set `VITE_API_URL=https://<domain>/api` di Vercel, tambahkan domain Vercel ke `FRONTEND_URL`, dan tambahkan `https://<domain-vercel>/reset-password` ke Redirect URLs Supabase.

## 8. Checklist sebelum produksi
- [ ] Migration sudah dijalankan; `npm run test:rls` lulus di project Supabase Anda
- [ ] `npm run test:e2e` lulus di project dev
- [ ] RLS tampil "enabled" untuk `public.todos` di Supabase Dashboard → Table Editor
- [ ] `FRONTEND_URL` hanya berisi domain yang benar
- [ ] SMTP kustom dikonfigurasi di Supabase (email bawaan sangat dibatasi lajunya)
- [ ] Tidak ada secret di GitHub
