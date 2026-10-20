-- Migration: tabel todos multi-user dengan Row Level Security
-- Jalankan lewat Supabase CLI (`supabase db push`) atau tempel ke SQL Editor.

-- 1. Tipe prioritas (urutan enum: low < medium < high, jadi ORDER BY priority bermakna)
create type public.todo_priority as enum ('low', 'medium', 'high');

-- 2. Tabel
create table public.todos (
  id           uuid                 primary key default gen_random_uuid(),
  user_id      uuid                 not null default auth.uid()
                                    references auth.users (id) on delete cascade,
  title        text                 not null,
  description  text,
  is_completed boolean              not null default false,
  priority     public.todo_priority not null default 'medium',
  due_date     timestamptz,
  created_at   timestamptz          not null default now(),
  updated_at   timestamptz          not null default now(),

  constraint todos_title_not_blank   check (char_length(btrim(title)) between 1 and 200),
  constraint todos_description_len   check (description is null or char_length(description) <= 5000)
);

comment on table public.todos is 'Task milik pengguna. Akses dibatasi RLS berdasarkan auth.uid().';

-- 3. Index (semua query aplikasi selalu memfilter user_id)
create index todos_user_created_idx   on public.todos (user_id, created_at desc);
create index todos_user_completed_idx on public.todos (user_id, is_completed);
create index todos_user_priority_idx  on public.todos (user_id, priority);
create index todos_user_due_idx       on public.todos (user_id, due_date);

-- 4. Trigger updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

-- 5. Row Level Security
alter table public.todos enable row level security;

create policy "todos_select_own" on public.todos
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "todos_insert_own" on public.todos
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- with check mencegah user memindahkan task ke user_id lain
create policy "todos_update_own" on public.todos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "todos_delete_own" on public.todos
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 6. Privilege eksplisit: anon (belum login) tidak punya akses sama sekali
revoke all on public.todos from anon;
grant select, insert, update, delete on public.todos to authenticated;
