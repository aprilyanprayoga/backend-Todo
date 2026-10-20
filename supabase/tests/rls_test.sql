-- Tes isolasi data RLS untuk public.todos.
-- Jalankan: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- (atau tempel di Supabase SQL Editor). Semua perubahan di-ROLLBACK di akhir.
-- Gagal = ada exception 'FAIL: ...'. Sukses = NOTICE 'ALL RLS TESTS PASSED'.

begin;

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- ===== Sebagai user A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

-- updated_at sengaja diset lampau agar efek trigger terlihat (now() konstan dalam satu transaksi)
insert into public.todos (id, user_id, title, updated_at)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Task milik A', '2000-01-01');

do $$
declare n int;
begin
  select count(*) into n from public.todos;
  if n <> 1 then raise exception 'FAIL: A seharusnya melihat 1 task, dapat %', n; end if;

  -- A tidak boleh membuat task atas nama B
  begin
    insert into public.todos (user_id, title) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Palsu');
    raise exception 'FAIL: A berhasil insert untuk B';
  exception when insufficient_privilege then null; end;

  -- title kosong ditolak constraint
  begin
    insert into public.todos (user_id, title) values (auth.uid(), '   ');
    raise exception 'FAIL: title kosong lolos';
  exception when check_violation then null; end;

  -- updated_at berubah saat update
  update public.todos set title = 'A diubah' where id = '11111111-1111-4111-8111-111111111111';
  if not exists (select 1 from public.todos where title = 'A diubah' and updated_at > '2001-01-01') then
    raise exception 'FAIL: trigger updated_at tidak bekerja';
  end if;
end $$;

-- ===== Sebagai user B =====
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

do $$
declare n int;
begin
  select count(*) into n from public.todos;
  if n <> 0 then raise exception 'FAIL: B melihat % task milik A', n; end if;

  update public.todos set title = 'Diretas B' where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B berhasil UPDATE task A'; end if;

  delete from public.todos where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B berhasil DELETE task A'; end if;

  insert into public.todos (id, user_id, title)
  values ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Task milik B');

  -- B tidak boleh mengalihkan task miliknya ke A
  begin
    update public.todos set user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    where id = '22222222-2222-4222-8222-222222222222';
    raise exception 'FAIL: B berhasil memindahkan task ke A';
  exception when insufficient_privilege then null; end;
end $$;

-- ===== Sebagai anon (belum login) =====
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  begin
    perform 1 from public.todos;
    raise exception 'FAIL: anon bisa membaca todos';
  exception when insufficient_privilege then null; end;
end $$;

-- ===== Verifikasi akhir sebagai A: data A tetap utuh =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

do $$
begin
  if not exists (select 1 from public.todos where id = '11111111-1111-4111-8111-111111111111' and title = 'A diubah') then
    raise exception 'FAIL: task A rusak/hilang';
  end if;
  if (select count(*) from public.todos) <> 1 then
    raise exception 'FAIL: A melihat task milik B';
  end if;
  raise notice 'ALL RLS TESTS PASSED';
end $$;

reset role;
rollback;
