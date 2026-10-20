# Dokumentasi API To-Do List

Dokumen ini adalah kontrak antara backend dan frontend (React + Vite). Nama field memakai **snake_case** persis seperti kolom database; frontend tidak perlu menerjemahkannya.

- Base URL lokal: `http://localhost:3000/api`
- Content-Type request/response: `application/json`
- Semua tanggal: string ISO 8601 UTC, contoh `"2026-12-31T17:00:00+00:00"`

## 1. Format respons

Sukses:
```json
{ "success": true, "data": { } }
```
Sukses dengan pagination (hanya `GET /todos`):
```json
{ "success": true, "data": [ ], "meta": { "page": 1, "limit": 20, "total": 45, "total_pages": 3 } }
```
Error:
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Input tidak valid", "details": [ { "field": "title", "message": "Title wajib diisi" } ] } }
```
`details` hanya ada pada `VALIDATION_ERROR`. Frontend sebaiknya bercabang berdasarkan `error.code` (stabil), bukan `message`.

## 2. Tipe data

```ts
type Priority = 'low' | 'medium' | 'high';

interface Todo {
  id: string;                 // UUID
  user_id: string;            // UUID pemilik (read-only, diisi server dari token)
  title: string;              // 1-200 karakter
  description: string | null; // maks 5000 karakter
  is_completed: boolean;      // default false
  priority: Priority;         // default 'medium'
  due_date: string | null;    // ISO 8601, contoh "2026-12-31T17:00:00Z"
  created_at: string;
  updated_at: string;
}

interface PublicUser { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; user_metadata: Record<string, unknown>; }
interface Session { access_token: string; refresh_token: string; token_type: 'bearer'; expires_in: number; expires_at: number | null; }
interface ApiSuccess<T> { success: true; data: T; meta?: { page: number; limit: number; total: number; total_pages: number } }
interface ApiError { success: false; error: { code: string; message: string; details?: { field: string; message: string }[] } }
```

## 3. Cara frontend mengirim access token

Setelah login, simpan `session.access_token` dan `session.refresh_token`. Kirim di setiap request yang butuh login:

```
Authorization: Bearer <access_token>
```

Jangan pernah mengirim `user_id` untuk menentukan pemilik: server mengabaikannya dan memakai identitas dari token.

Contoh klien fetch dengan auto-refresh:

```ts
const API = import.meta.env.VITE_API_URL; // contoh: http://localhost:3000/api

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<ApiSuccess<T>> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const json = await res.json();

  if (res.status === 401 && retry && ['TOKEN_EXPIRED', 'INVALID_TOKEN'].includes(json.error?.code)) {
    const refreshed = await refreshSession();
    if (refreshed) return api<T>(path, init, false);
  }
  if (!json.success) throw json.error; // { code, message, details? }
  return json;
}

async function refreshSession(): Promise<boolean> {
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) return false;
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token }),
  });
  const json = await res.json();
  if (!json.success) { localStorage.clear(); return false; } // arahkan ke halaman login
  localStorage.setItem('access_token', json.data.session.access_token);
  localStorage.setItem('refresh_token', json.data.session.refresh_token);
  return true;
}
```
Catatan: refresh token Supabase bersifat sekali pakai (rotasi). Pastikan hanya satu refresh berjalan pada satu waktu dan selalu simpan refresh token baru.

## 4. Endpoint

| Method | URL | Auth | Keterangan |
|---|---|---|---|
| GET | `/api/health` | - | Health check |
| POST | `/api/auth/register` | - | Daftar |
| POST | `/api/auth/login` | - | Login |
| POST | `/api/auth/refresh` | - | Perpanjang session |
| POST | `/api/auth/logout` | Bearer | Logout |
| GET | `/api/auth/me` | Bearer | User saat ini |
| POST | `/api/auth/forgot-password` | - | Kirim email reset |
| POST | `/api/auth/reset-password` | Bearer (token recovery) | Setel password baru |
| POST | `/api/todos` | Bearer | Buat todo |
| GET | `/api/todos` | Bearer | Daftar todo (search/filter/sort/pagination) |
| GET | `/api/todos/:id` | Bearer | Detail todo |
| PATCH | `/api/todos/:id` | Bearer | Ubah sebagian field |
| DELETE | `/api/todos/:id` | Bearer | Hapus todo |

### GET /api/health
`200` → `{ "success": true, "data": { "status": "ok", "uptime": 123, "timestamp": "..." } }`

### POST /api/auth/register
Body: `{ "email": "user@example.com", "password": "min8karakter", "display_name": "Budi" }` (`display_name` opsional; password 8–72 karakter).

`201`:
```json
{ "success": true, "data": {
  "user": { "id": "…", "email": "user@example.com", "created_at": "…", "last_sign_in_at": null, "user_metadata": {} },
  "session": { "access_token": "…", "refresh_token": "…", "token_type": "bearer", "expires_in": 3600, "expires_at": 1767225600 },
  "requires_email_confirmation": false
} }
```
Jika "Confirm email" aktif di Supabase: `session` bernilai `null` dan `requires_email_confirmation` bernilai `true`; tampilkan pesan "cek email Anda", lalu user login setelah verifikasi.
Error: `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_REGISTERED`, `422 WEAK_PASSWORD`, `429 RATE_LIMITED`, `403 SIGNUP_DISABLED`.

### POST /api/auth/login
Body: `{ "email": "…", "password": "…" }` → `200` `{ user, session }` (bentuk sama seperti di atas, tanpa `requires_email_confirmation`).
Error: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `403 EMAIL_NOT_CONFIRMED`, `429 RATE_LIMITED`.

### POST /api/auth/refresh
Body: `{ "refresh_token": "…" }` → `200` `{ user, session }`. Error: `401 INVALID_REFRESH_TOKEN` (arahkan user ke login).

### POST /api/auth/logout
Header Bearer. `200` → `{ "success": true, "data": { "message": "Logout berhasil" } }`. Hanya mengakhiri session perangkat ini. Frontend wajib menghapus token lokal.

### GET /api/auth/me
Header Bearer. `200` → `{ "success": true, "data": { "user": PublicUser } }`.
Error: `401 UNAUTHORIZED` (header tidak ada), `401 INVALID_TOKEN`, `401 TOKEN_EXPIRED`, `503 AUTH_SERVICE_UNAVAILABLE`.

### POST /api/auth/forgot-password
Body: `{ "email": "…" }` → selalu `200` dengan pesan generik (agar tidak membocorkan email terdaftar). Supabase mengirim email berisi tautan yang mengarah ke `<FRONTEND_URL pertama>/reset-password`.

### POST /api/auth/reset-password
Alur lengkap:
1. User klik tautan di email → browser membuka `/reset-password` di frontend dengan `access_token` (dan `refresh_token`, `type=recovery`) di **URL hash** (`#access_token=…`).
2. Frontend membaca token dari hash, lalu memanggil endpoint ini dengan `Authorization: Bearer <access_token dari hash>`.
3. Body: `{ "password": "passwordbaru123" }` → `200` `{ "message": "Password berhasil diubah" }`. Setelah itu hapus hash dari URL dan arahkan ke login.

Error: `400 VALIDATION_ERROR`, `401 INVALID_TOKEN/TOKEN_EXPIRED`, `422 WEAK_PASSWORD`, `422 SAME_PASSWORD`.

### POST /api/todos
Body (hanya `title` wajib):
```json
{ "title": "Beli susu", "description": "2 liter", "priority": "high", "due_date": "2026-12-31T17:00:00Z", "is_completed": false }
```
`201` → `{ "success": true, "data": Todo }`. Field lain (termasuk `user_id`) diabaikan.
Error: `400 VALIDATION_ERROR`, `401`.

### GET /api/todos
Query (semua opsional):

| Param | Nilai | Default | Keterangan |
|---|---|---|---|
| `search` | teks ≤200 | - | Cari di `title`, tidak peka huruf besar/kecil |
| `is_completed` | `true` / `false` | - | Filter status |
| `priority` | `low` / `medium` / `high` | - | Filter prioritas |
| `sort_by` | `created_at`, `updated_at`, `due_date`, `priority`, `title` | `created_at` | `priority` diurutkan low < medium < high; `due_date` kosong selalu di akhir |
| `order` | `asc` / `desc` | `desc` | |
| `page` | integer ≥1 | `1` | |
| `limit` | 1–100 | `20` | |

`200` → `{ "success": true, "data": Todo[], "meta": { page, limit, total, total_pages } }`.
Error: `400 VALIDATION_ERROR`, `401`.

### GET /api/todos/:id
`200` → `{ "success": true, "data": Todo }`. Error: `400` (id bukan UUID), `401`, `404 NOT_FOUND`.

### PATCH /api/todos/:id
Body: minimal satu dari `title`, `description`, `is_completed`, `priority`, `due_date`. Kirim `null` pada `description` atau `due_date` untuk mengosongkannya. `200` → `{ "success": true, "data": Todo }` (todo terbaru). Error: `400`, `401`, `404`.

### DELETE /api/todos/:id
`200` → `{ "success": true, "data": { "id": "…" } }`. Error: `400`, `401`, `404`.

> Todo milik user lain **selalu menghasilkan 404** (bukan 403), sehingga keberadaannya tidak bocor.

## 5. Daftar kode error

| HTTP | `error.code` | Arti / tindakan frontend |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Tampilkan `details[].message` per field |
| 400 | `INVALID_JSON`, `INVALID_DATA` | Bug klien |
| 401 | `UNAUTHORIZED` | Header Authorization tidak ada → login |
| 401 | `TOKEN_EXPIRED`, `INVALID_TOKEN` | Coba `/auth/refresh`, jika gagal → login |
| 401 | `INVALID_CREDENTIALS` | Email/password salah |
| 401 | `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED` | Login ulang |
| 403 | `EMAIL_NOT_CONFIRMED`, `USER_BANNED`, `SIGNUP_DISABLED`, `FORBIDDEN`, `CORS_NOT_ALLOWED` | Tampilkan pesan |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND` | Todo tidak ada / bukan milik Anda |
| 409 | `EMAIL_ALREADY_REGISTERED` | |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 100 KB |
| 422 | `WEAK_PASSWORD`, `SAME_PASSWORD` | |
| 429 | `RATE_LIMITED` | Auth dibatasi 30 request / 15 menit / IP |
| 500 | `INTERNAL_ERROR`, `DATABASE_ERROR` | Pesan generik |
| 503 | `AUTH_SERVICE_UNAVAILABLE` | Coba lagi nanti |

## 6. Contoh curl

```bash
BASE=http://localhost:3000/api

# Login dan ambil token
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password123"}' | jq -r .data.session.access_token)

# Buat todo
curl -s -X POST $BASE/todos -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Beli susu","priority":"high","due_date":"2026-12-31T17:00:00Z"}'

# Daftar: belum selesai, prioritas high, urut due_date naik
curl -s "$BASE/todos?is_completed=false&priority=high&sort_by=due_date&order=asc&search=susu" \
  -H "Authorization: Bearer $TOKEN"

# Tandai selesai
curl -s -X PATCH $BASE/todos/<ID> -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"is_completed":true}'

# Hapus
curl -s -X DELETE $BASE/todos/<ID> -H "Authorization: Bearer $TOKEN"
```

## 7. CORS
Backend hanya menerima origin yang terdaftar di `FRONTEND_URL` (dipisah koma). Metode: GET, POST, PATCH, DELETE, OPTIONS. Header: `Content-Type`, `Authorization`. Domain preview Vercel (`*-git-*.vercel.app`) harus didaftarkan satu per satu.
