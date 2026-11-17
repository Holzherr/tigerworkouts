-- Review round 2, A3 (Nick, 2026-11-17): two devices editing one row. Until now the last upload won
-- (an offline edit sent days later overwrote newer work) and a delete was only a missing row (a
-- device that had not heard of it uploaded the row again).
--
-- 1. Stale writes. A client that knows the row's updated_at as it last read it sends that value
--    with its write. If the row has changed since, the write is refused with HTTP 409 (PT409), and
--    the client takes the server's copy. A write that does not send updated_at (every app before
--    this change) goes through as before, so older apps keep working.
-- 2. Tombstones. Deleting a session or workout records its id and deleted_at in deleted_rows. A
--    client re-sending that row with the updated_at it saw before the delete is refused with HTTP
--    410 (PT410), and the client drops its copy. Without updated_at (older apps, or a row put back
--    on purpose) the insert goes through, as before, and the tombstone is cleared.
--
-- Rows are still deleted for real: older apps never see a soft-deleted row. Nothing existing changes.
-- Contains `delete` (the tombstone cleanup), so deploy-watch holds it for applying by hand.

create table if not exists public.deleted_rows (
  kind text not null check (kind in ('session', 'workout')),
  id text not null,
  owner uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (kind, id)
);
create index if not exists deleted_rows_owner on public.deleted_rows(owner, deleted_at desc);
alter table public.deleted_rows enable row level security;
create policy "deleted_rows: own reads" on public.deleted_rows for select to authenticated using (owner = auth.uid());
-- Read only: the triggers below are the only writers.
revoke all on public.deleted_rows from anon, authenticated;
grant select on public.deleted_rows to authenticated;

-- After a delete: remember it. Not for an account being deleted (its user row is already gone when
-- the cascade reaches its rows), which takes everything with it anyway.
create or replace function public.remember_deleted_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.owner is not null and exists (select 1 from auth.users u where u.id = old.owner) then
    insert into public.deleted_rows (kind, id, owner) values (tg_argv[0], old.id, old.owner)
      on conflict (kind, id) do update set owner = excluded.owner, deleted_at = now();
  end if;
  return old;
end $$;

-- Before a write. Named to sort before touch_<table>, which sets updated_at to now(): Postgres runs
-- a table's BEFORE triggers in name order, and this one has to see the value the client sent.
create or replace function public.refuse_stale_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare gone timestamptz;
begin
  if tg_op = 'UPDATE' then
    if new.updated_at is distinct from old.updated_at and new.updated_at < old.updated_at then
      raise exception using errcode = 'PT409', message = 'stale write: the row changed since this device read it', detail = old.updated_at::text;
    end if;
    return new;
  end if;
  select d.deleted_at into gone from public.deleted_rows d where d.kind = tg_argv[0] and d.id = new.id;
  if gone is not null then
    if new.updated_at < gone then
      raise exception using errcode = 'PT410', message = 'deleted: the row was deleted after this device read it', detail = gone::text;
    end if;
    delete from public.deleted_rows d where d.kind = tg_argv[0] and d.id = new.id;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'sessions_remember_deleted') then
    create trigger sessions_remember_deleted after delete on public.sessions for each row execute function public.remember_deleted_row('session');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'workouts_remember_deleted') then
    create trigger workouts_remember_deleted after delete on public.workouts for each row execute function public.remember_deleted_row('workout');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'stale_guard_sessions') then
    create trigger stale_guard_sessions before insert or update on public.sessions for each row execute function public.refuse_stale_write('session');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'stale_guard_workouts') then
    create trigger stale_guard_workouts before insert or update on public.workouts for each row execute function public.refuse_stale_write('workout');
  end if;
end $$;

-- Tombstones older than 180 days go: a device away that long re-uploads as an older app would.
-- Daily at 03:27 UTC; skipped where pg_cron isn't available (the local RLS harness).
create or replace function public.forget_old_deleted_rows() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.deleted_rows where deleted_at < now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.forget_old_deleted_rows() from public, anon, authenticated;
revoke all on function public.remember_deleted_row() from public, anon, authenticated;
revoke all on function public.refuse_stale_write() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if not exists (select 1 from cron.job where jobname = 'forget-old-deleted-rows') then
      perform cron.schedule('forget-old-deleted-rows', '27 3 * * *', 'select public.forget_old_deleted_rows()');
    end if;
  end if;
end $$;
